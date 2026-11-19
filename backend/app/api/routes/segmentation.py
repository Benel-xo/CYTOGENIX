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

router = APIRouter(prefix="/segmentation", tags=["Tissue Segmentation"])

PROJECT_ROOT = Path(__file__).resolve().parents[4]
UPLOAD_DIR = PROJECT_ROOT / "data" / "raw"
OUTPUT_DIR = PROJECT_ROOT / "data" / "processed" / "segmentation"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class SegmentationParameters(BaseModel):
    saturation_threshold: int = Field(default=20, ge=0, le=255)
    brightness_threshold: int = Field(default=245, ge=0, le=255)
    minimum_region_area: int = Field(default=100, ge=1, le=1000000)
    morphology_kernel: int = Field(default=5, ge=1, le=31)


def initialise_table():
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS tissue_segmentation_runs (
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
    extension = path.suffix.lower()

    if extension == ".svs":
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


def segment_tissue(rgb: np.ndarray, parameters: SegmentationParameters):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    saturation = hsv[:, :, 1]
    brightness = hsv[:, :, 2]

    mask = (
        (saturation >= parameters.saturation_threshold) &
        (brightness <= parameters.brightness_threshold)
    ).astype(np.uint8) * 255

    kernel_size = parameters.morphology_kernel
    if kernel_size % 2 == 0:
        kernel_size += 1

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (kernel_size, kernel_size)
    )

    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    count, labels, stats, centroids = cv2.connectedComponentsWithStats(
        mask, connectivity=8
    )

    cleaned = np.zeros_like(mask)
    regions = []

    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])

        if area < parameters.minimum_region_area:
            continue

        cleaned[labels == label] = 255
        regions.append({
            "region_number": len(regions) + 1,
            "area_pixels": area,
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

    return cleaned, regions


@router.post("/images/{image_id}/run")
def run_segmentation(image_id: str, parameters: SegmentationParameters):
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
        raise HTTPException(status_code=404, detail="Registered image not found.")

    source_path = UPLOAD_DIR / record["stored_name"]

    if not source_path.is_file():
        raise HTTPException(status_code=404, detail="Stored image file is missing.")

    rgb, original_width, original_height = load_rgb_image(source_path)
    mask, regions = segment_tissue(rgb, parameters)

    overlay = rgb.copy()
    tissue_pixels = mask > 0
    overlay[tissue_pixels] = (
        0.55 * overlay[tissue_pixels] +
        0.45 * np.array([40, 220, 170])
    ).astype(np.uint8)

    contours, _ = cv2.findContours(
        mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    overlay_bgr = cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
    cv2.drawContours(overlay_bgr, contours, -1, (255, 220, 40), 1)
    overlay = cv2.cvtColor(overlay_bgr, cv2.COLOR_BGR2RGB)

    run_id = str(uuid4())
    mask_filename = f"{run_id}_mask.png"
    overlay_filename = f"{run_id}_overlay.png"

    if not cv2.imwrite(str(OUTPUT_DIR / mask_filename), mask):
        raise HTTPException(status_code=500, detail="Could not save segmentation mask.")

    if not cv2.imwrite(
        str(OUTPUT_DIR / overlay_filename),
        cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
    ):
        raise HTTPException(status_code=500, detail="Could not save overlay image.")

    analysis_height, analysis_width = mask.shape
    total_pixels = int(mask.size)
    tissue_pixels_count = int(np.count_nonzero(mask))

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
        "tissue_pixels": tissue_pixels_count,
        "background_pixels": total_pixels - tissue_pixels_count,
        "tissue_coverage_percent": round(
            tissue_pixels_count / total_pixels * 100, 2
        ) if total_pixels else 0,
        "detected_region_count": len(regions),
        "regions": regions,
        "method": "HSV thresholding with morphological cleanup and connected components",
        "limitations": [
            "This is experimental colour-threshold segmentation, not a trained AI model.",
            "The method may include staining artefacts, debris or other coloured material.",
            "Pale, weakly stained or unusual tissue may be missed.",
            "Measurements are in analysis-thumbnail pixels, not calibrated physical units.",
            "SVS images are processed using a thumbnail, not the full-resolution slide.",
            "Results are not validated for clinical diagnosis or patient management."
        ]
    }

    parameter_data = parameters.model_dump()

    with engine.begin() as connection:
        connection.execute(
            text("""
                INSERT INTO tissue_segmentation_runs
                (id, image_id, parameters, results, mask_filename, overlay_filename)
                VALUES (
                    :id, :image_id, CAST(:parameters AS JSONB),
                    CAST(:results AS JSONB), :mask_filename, :overlay_filename
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

    return {
        "run_id": run_id,
        "image_id": image_id,
        "filename": record["original_name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "parameters": parameter_data,
        "results": results,
        "mask_url": f"/api/v1/segmentation/runs/{run_id}/mask",
        "overlay_url": f"/api/v1/segmentation/runs/{run_id}/overlay"
    }


def get_run_file(run_id: str, file_type: str):
    column = "mask_filename" if file_type == "mask" else "overlay_filename"

    with engine.connect() as connection:
        row = connection.execute(
            text(f"""
                SELECT {column} AS filename
                FROM tissue_segmentation_runs
                WHERE id = :id
            """),
            {"id": run_id}
        ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Segmentation run not found.")

    filename = row["filename"]
    path = (OUTPUT_DIR / filename).resolve()

    if path.parent != OUTPUT_DIR.resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Segmentation output file not found.")

    return FileResponse(path, media_type="image/png", filename=filename)


@router.get("/runs/{run_id}/mask")
def download_mask(run_id: str):
    return get_run_file(run_id, "mask")


@router.get("/runs/{run_id}/overlay")
def download_overlay(run_id: str):
    return get_run_file(run_id, "overlay")


@router.get("/images/{image_id}/runs")
def get_segmentation_history(image_id: str):
    with engine.connect() as connection:
        exists = connection.execute(
            text("SELECT id FROM microscopy_images WHERE id = :id"),
            {"id": image_id}
        ).first()

        if not exists:
            raise HTTPException(status_code=404, detail="Registered image not found.")

        rows = connection.execute(
            text("""
                SELECT id, parameters, results, created_at
                FROM tissue_segmentation_runs
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
                "mask_url": f"/api/v1/segmentation/runs/{row['id']}/mask",
                "overlay_url": f"/api/v1/segmentation/runs/{row['id']}/overlay"
            }
            for row in rows
        ]
    }
