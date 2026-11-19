
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
import json

import cv2
import numpy as np
from PIL import Image, ImageOps
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.db.session import engine

router = APIRouter(
    prefix="/cellular-intelligence",
    tags=["Cellular Intelligence"]
)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
UPLOAD_DIR = PROJECT_ROOT / "data" / "raw"
OUTPUT_DIR = (
    PROJECT_ROOT / "data" / "processed" / "cellular_intelligence"
)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class CellularParameters(BaseModel):
    saturation_threshold: int = Field(default=35, ge=0, le=255)
    darkness_threshold: int = Field(default=225, ge=0, le=255)
    minimum_nucleus_area: int = Field(default=20, ge=1, le=100000)
    maximum_nucleus_area: int = Field(default=5000, ge=1, le=1000000)
    morphology_kernel: int = Field(default=3, ge=1, le=15)


def initialise_table():
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS cellular_intelligence_runs (
                id VARCHAR(36) PRIMARY KEY,
                image_id VARCHAR(36) NOT NULL
                    REFERENCES microscopy_images(id) ON DELETE CASCADE,
                parameters JSONB NOT NULL,
                results JSONB NOT NULL,
                mask_filename TEXT NOT NULL,
                overlay_filename TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))


initialise_table()


def load_rgb_image(path: Path):
    if path.suffix.lower() == ".svs":
        try:
            import openslide

            slide = openslide.OpenSlide(str(path))
            original_width, original_height = slide.dimensions
            image = slide.get_thumbnail((2000, 2000)).convert("RGB")
            slide.close()

            return np.asarray(image), original_width, original_height

        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not read whole-slide image: {exc}"
            )

    try:
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            original_width, original_height = image.size
            image.thumbnail((2000, 2000))

            return np.asarray(image), original_width, original_height

    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not decode image: {exc}"
        )


def detect_nuclei(rgb: np.ndarray, parameters: CellularParameters):
    """
    Experimental colour-based nuclei candidate detection.

    This is not a trained cell detector. Connected components are
    approximate image regions and may not correspond to individual cells.
    """

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)

    saturation = hsv[:, :, 1]
    brightness = hsv[:, :, 2]

    red = rgb[:, :, 0].astype(np.int16)
    green = rgb[:, :, 1].astype(np.int16)
    blue = rgb[:, :, 2].astype(np.int16)

    # Approximate purple / blue stain preference.
    purple_score = (
        (blue >= red - 15) &
        (red >= green - 10) &
        (saturation >= parameters.saturation_threshold) &
        (brightness <= parameters.darkness_threshold)
    )

    candidate_mask = purple_score.astype(np.uint8) * 255

    kernel_size = parameters.morphology_kernel
    if kernel_size % 2 == 0:
        kernel_size += 1

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (kernel_size, kernel_size)
    )

    cleaned = cv2.morphologyEx(
        candidate_mask,
        cv2.MORPH_OPEN,
        kernel
    )

    count, labels, stats, centroids = cv2.connectedComponentsWithStats(
        cleaned,
        connectivity=8
    )

    final_mask = np.zeros_like(cleaned)
    nuclei = []

    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])

        if not (
            parameters.minimum_nucleus_area
            <= area
            <= parameters.maximum_nucleus_area
        ):
            continue

        component = (labels == label).astype(np.uint8) * 255

        contours, _ = cv2.findContours(
            component,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        if not contours:
            continue

        contour = max(contours, key=cv2.contourArea)

        perimeter = float(cv2.arcLength(contour, True))
        contour_area = float(cv2.contourArea(contour))

        circularity = (
            (4.0 * np.pi * contour_area) / (perimeter ** 2)
            if perimeter > 0
            else 0.0
        )

        final_mask[labels == label] = 255

        nuclei.append({
            "nucleus_number": len(nuclei) + 1,
            "area_pixels": area,
            "perimeter_pixels": round(perimeter, 2),
            "circularity": round(
                max(0.0, min(1.0, circularity)), 4
            ),
            "bounding_box": {
                "x": int(stats[label, cv2.CC_STAT_LEFT]),
                "y": int(stats[label, cv2.CC_STAT_TOP]),
                "width": int(stats[label, cv2.CC_STAT_WIDTH]),
                "height": int(stats[label, cv2.CC_STAT_HEIGHT])
            },
            "centroid": {
                "x": round(float(centroids[label][0]), 2),
                "y": round(float(centroids[label][1]), 2)
            }
        })

    return final_mask, nuclei


@router.post("/images/{image_id}/run")
def run_cellular_analysis(
    image_id: str,
    parameters: CellularParameters
):
    if parameters.maximum_nucleus_area < parameters.minimum_nucleus_area:
        raise HTTPException(
            status_code=422,
            detail="Maximum nucleus area must be greater than or equal to minimum nucleus area."
        )

    with engine.connect() as connection:
        record = connection.execute(
            text("""
                SELECT id, stored_name, original_name, file_format
                FROM microscopy_images
                WHERE id = :id
            """),
            {"id": image_id}
        ).mappings().first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Registered microscopy image not found."
        )

    source_path = UPLOAD_DIR / record["stored_name"]

    if not source_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Stored microscopy image file is missing."
        )

    rgb, original_width, original_height = load_rgb_image(source_path)

    mask, nuclei = detect_nuclei(rgb, parameters)

    overlay = rgb.copy()
    contours, _ = cv2.findContours(
        mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    overlay_bgr = cv2.cvtColor(
        overlay,
        cv2.COLOR_RGB2BGR
    )

    cv2.drawContours(
        overlay_bgr,
        contours,
        -1,
        (40, 220, 255),
        1
    )

    for nucleus in nuclei:
        x = nucleus["bounding_box"]["x"]
        y = nucleus["bounding_box"]["y"]
        width = nucleus["bounding_box"]["width"]
        height = nucleus["bounding_box"]["height"]

        cv2.rectangle(
            overlay_bgr,
            (x, y),
            (x + width, y + height),
            (255, 180, 30),
            1
        )

    overlay = cv2.cvtColor(
        overlay_bgr,
        cv2.COLOR_BGR2RGB
    )

    run_id = str(uuid4())

    mask_filename = f"{run_id}_mask.png"
    overlay_filename = f"{run_id}_overlay.png"

    mask_path = OUTPUT_DIR / mask_filename
    overlay_path = OUTPUT_DIR / overlay_filename

    if not cv2.imwrite(str(mask_path), mask):
        raise HTTPException(
            status_code=500,
            detail="Could not save cellular mask."
        )

    if not cv2.imwrite(
        str(overlay_path),
        cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
    ):
        raise HTTPException(
            status_code=500,
            detail="Could not save cellular overlay."
        )

    analysis_height, analysis_width = mask.shape
    total_pixels = int(mask.size)

    areas = [item["area_pixels"] for item in nuclei]
    perimeters = [item["perimeter_pixels"] for item in nuclei]
    circularities = [item["circularity"] for item in nuclei]

    detected_count = len(nuclei)

    results = {
        "source_dimensions": {
            "width": original_width,
            "height": original_height
        },
        "analysis_dimensions": {
            "width": analysis_width,
            "height": analysis_height
        },
        "total_analysis_pixels": total_pixels,
        "detected_nuclei_count": detected_count,
        "nuclei_density_per_10000_pixels": round(
            detected_count / total_pixels * 10000,
            4
        ) if total_pixels else 0,
        "nuclei_area_pixels": int(np.count_nonzero(mask)),
        "mean_nucleus_area_pixels": round(
            float(np.mean(areas)), 2
        ) if areas else 0,
        "median_nucleus_area_pixels": round(
            float(np.median(areas)), 2
        ) if areas else 0,
        "minimum_nucleus_area_pixels": min(areas) if areas else 0,
        "maximum_nucleus_area_pixels": max(areas) if areas else 0,
        "mean_perimeter_pixels": round(
            float(np.mean(perimeters)), 2
        ) if perimeters else 0,
        "mean_circularity": round(
            float(np.mean(circularities)), 4
        ) if circularities else 0,
        "nuclei": nuclei,
        "method": (
            "Approximate purple/blue stain colour filtering, "
            "morphological opening and connected-component analysis."
        ),
        "limitations": [
            "This is experimental heuristic image processing, not trained AI.",
            "Detected connected components are candidate regions, not verified individual cells.",
            "Touching nuclei may be merged into one region.",
            "Staining artefacts and debris may be detected as candidate nuclei.",
            "Weakly stained nuclei may be missed.",
            "Measurements are in analysis-thumbnail pixels, not calibrated physical units.",
            "SVS whole-slide images are processed using a thumbnail.",
            "No clinical or diagnostic validation has been performed."
        ]
    }

    parameter_data = parameters.model_dump()

    try:
        with engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO cellular_intelligence_runs
                    (
                        id,
                        image_id,
                        parameters,
                        results,
                        mask_filename,
                        overlay_filename
                    )
                    VALUES (
                        :id,
                        :image_id,
                        CAST(:parameters AS JSONB),
                        CAST(:results AS JSONB),
                        :mask_filename,
                        :overlay_filename
                    )
                """),
                {
                    "id": run_id,
                    "image_id": image_id,
                    "parameters": json.dumps(parameter_data),
                    "results": json.dumps(results),
                    "mask_filename": mask_filename,
                    "overlay_filename": overlay_filename
                }
            )
    except Exception:
        mask_path.unlink(missing_ok=True)
        overlay_path.unlink(missing_ok=True)
        raise

    return {
        "run_id": run_id,
        "image_id": image_id,
        "filename": record["original_name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "parameters": parameter_data,
        "results": results,
        "mask_url": (
            f"/api/v1/cellular-intelligence/runs/{run_id}/mask"
        ),
        "overlay_url": (
            f"/api/v1/cellular-intelligence/runs/{run_id}/overlay"
        )
    }


def get_run_file(run_id: str, file_type: str):
    column = (
        "mask_filename"
        if file_type == "mask"
        else "overlay_filename"
    )

    with engine.connect() as connection:
        row = connection.execute(
            text(f"""
                SELECT {column} AS filename
                FROM cellular_intelligence_runs
                WHERE id = :id
            """),
            {"id": run_id}
        ).mappings().first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Cellular analysis run not found."
        )

    filename = row["filename"]
    path = (OUTPUT_DIR / filename).resolve()

    if path.parent != OUTPUT_DIR.resolve() or not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Cellular analysis output file not found."
        )

    return FileResponse(
        path,
        media_type="image/png",
        filename=filename
    )


@router.get("/runs/{run_id}/mask")
def download_cellular_mask(run_id: str):
    return get_run_file(run_id, "mask")


@router.get("/runs/{run_id}/overlay")
def download_cellular_overlay(run_id: str):
    return get_run_file(run_id, "overlay")


@router.get("/images/{image_id}/runs")
def get_cellular_history(image_id: str):
    with engine.connect() as connection:
        exists = connection.execute(
            text("SELECT id FROM microscopy_images WHERE id = :id"),
            {"id": image_id}
        ).first()

        if not exists:
            raise HTTPException(
                status_code=404,
                detail="Registered microscopy image not found."
            )

        rows = connection.execute(
            text("""
                SELECT id, parameters, results, created_at
                FROM cellular_intelligence_runs
                WHERE image_id = :image_id
                ORDER BY created_at DESC
            """),
            {"image_id": image_id}
        ).mappings().all()

    return {
        "image_id": image_id,
        "runs": [
            {
                "run_id": row["id"],
                "parameters": row["parameters"],
                "results": row["results"],
                "created_at": row["created_at"].isoformat(),
                "mask_url": (
                    f"/api/v1/cellular-intelligence/runs/{row['id']}/mask"
                ),
                "overlay_url": (
                    f"/api/v1/cellular-intelligence/runs/{row['id']}/overlay"
                )
            }
            for row in rows
        ]
    }
