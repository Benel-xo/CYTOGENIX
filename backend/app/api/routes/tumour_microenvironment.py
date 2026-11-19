from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
import csv
import io
import json

import cv2
import numpy as np
from PIL import Image, ImageOps
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.db.session import engine

router = APIRouter(
    prefix="/tumour-microenvironment",
    tags=["Tumour Microenvironment"],
)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
UPLOAD_DIR = PROJECT_ROOT / "data" / "raw"
OUTPUT_DIR = PROJECT_ROOT / "data" / "processed" / "tumour_microenvironment"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class MicroenvironmentParameters(BaseModel):
    tissue_saturation_threshold: int = Field(default=12, ge=0, le=255)
    tumour_saturation_threshold: int = Field(default=35, ge=0, le=255)
    immune_saturation_threshold: int = Field(default=35, ge=0, le=255)
    immune_darkness_threshold: int = Field(default=190, ge=0, le=255)
    minimum_region_area: int = Field(default=80, ge=1, le=1000000)
    maximum_immune_area: int = Field(default=350, ge=1, le=100000)
    proximity_distance_pixels: int = Field(default=30, ge=1, le=1000)
    morphology_kernel: int = Field(default=3, ge=1, le=15)


def initialise_table():
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS tumour_microenvironment_runs (
                id VARCHAR(36) PRIMARY KEY,
                image_id VARCHAR(36) NOT NULL
                    REFERENCES microscopy_images(id) ON DELETE CASCADE,
                parameters JSONB NOT NULL,
                results JSONB NOT NULL,
                overlay_filename TEXT NOT NULL,
                compartments_filename TEXT NOT NULL,
                immune_mask_filename TEXT NOT NULL,
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
                detail=f"Could not read whole-slide image: {exc}",
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
            detail=f"Could not decode image: {exc}",
        )


def clean_mask(mask: np.ndarray, kernel_size: int):
    size = kernel_size if kernel_size % 2 else kernel_size + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
    opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    return cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel)


def analyse_compartments(rgb: np.ndarray, parameters: MicroenvironmentParameters):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    saturation = hsv[:, :, 1]
    brightness = hsv[:, :, 2]
    red = rgb[:, :, 0].astype(np.int16)
    green = rgb[:, :, 1].astype(np.int16)
    blue = rgb[:, :, 2].astype(np.int16)

    tissue = (
        (saturation >= parameters.tissue_saturation_threshold)
        & (brightness <= 250)
    ).astype(np.uint8) * 255

    # Broad colour heuristic for eosin/pink-like candidate regions.
    tumour_raw = (
        (tissue > 0)
        & (red >= green - 5)
        & (red >= blue - 15)
        & (saturation >= parameters.tumour_saturation_threshold)
        & (brightness <= 250)
    ).astype(np.uint8) * 255

    tumour = clean_mask(tumour_raw, parameters.morphology_kernel)
    tumour = cv2.bitwise_and(tumour, tissue)
    stroma = cv2.bitwise_and(tissue, cv2.bitwise_not(tumour))

    # Dark purple/blue colour candidates; not a validated lymphocyte detector.
    immune_raw = (
        (blue >= red - 15)
        & (red >= green - 10)
        & (saturation >= parameters.immune_saturation_threshold)
        & (brightness <= parameters.immune_darkness_threshold)
    ).astype(np.uint8) * 255
    immune = clean_mask(immune_raw, parameters.morphology_kernel)

    count, labels, stats, centroids = cv2.connectedComponentsWithStats(
        immune, connectivity=8
    )
    immune_clean = np.zeros_like(immune)
    candidates = []

    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area > parameters.maximum_immune_area:
            continue
        if area < parameters.minimum_region_area:
            continue
        immune_clean[labels == label] = 255
        candidates.append({
            "candidate_number": len(candidates) + 1,
            "area_pixels": area,
            "centroid_x": round(float(centroids[label][0]), 2),
            "centroid_y": round(float(centroids[label][1]), 2),
            "bounding_box": {
                "x": int(stats[label, cv2.CC_STAT_LEFT]),
                "y": int(stats[label, cv2.CC_STAT_TOP]),
                "width": int(stats[label, cv2.CC_STAT_WIDTH]),
                "height": int(stats[label, cv2.CC_STAT_HEIGHT]),
            },
        })

    tumour_binary = (tumour > 0).astype(np.uint8)
    if np.any(tumour_binary):
        distance_map = cv2.distanceTransform(
            (1 - tumour_binary).astype(np.uint8),
            cv2.DIST_L2,
            3,
        )
        for candidate in candidates:
            x = min(max(int(round(candidate["centroid_x"])), 0), rgb.shape[1] - 1)
            y = min(max(int(round(candidate["centroid_y"])), 0), rgb.shape[0] - 1)
            candidate["distance_to_tumour_pixels"] = round(float(distance_map[y, x]), 2)
            candidate["spatial_group"] = (
                "near_candidate_tumour_region"
                if candidate["distance_to_tumour_pixels"] <= parameters.proximity_distance_pixels
                else "far_from_candidate_tumour_region"
            )
    else:
        for candidate in candidates:
            candidate["distance_to_tumour_pixels"] = None
            candidate["spatial_group"] = "not_assessed_no_tumour_candidate"

    return tissue, tumour, stroma, immune_clean, candidates


def build_overlay(rgb, tumour, stroma, immune):
    overlay = rgb.astype(np.float32).copy()
    masks = [
        (stroma > 0, np.array([60, 150, 245], dtype=np.float32)),
        (tumour > 0, np.array([235, 90, 150], dtype=np.float32)),
        (immune > 0, np.array([70, 230, 230], dtype=np.float32)),
    ]
    for selected, colour in masks:
        overlay[selected] = 0.55 * overlay[selected] + 0.45 * colour
    return np.clip(overlay, 0, 255).astype(np.uint8)


def save_png(path: Path, image: np.ndarray, rgb=True):
    output = cv2.cvtColor(image, cv2.COLOR_RGB2BGR) if rgb else image
    if not cv2.imwrite(str(path), output):
        raise HTTPException(status_code=500, detail=f"Could not save output image: {path.name}")


@router.post("/images/{image_id}/run")
def run_microenvironment_analysis(
    image_id: str,
    parameters: MicroenvironmentParameters,
):
    if parameters.maximum_immune_area < parameters.minimum_region_area:
        raise HTTPException(
            status_code=422,
            detail="Maximum immune-candidate area must be greater than or equal to minimum region area.",
        )

    with engine.connect() as connection:
        record = connection.execute(
            text("""
                SELECT id, stored_name, original_name
                FROM microscopy_images
                WHERE id = :id
            """),
            {"id": image_id},
        ).mappings().first()

    if not record:
        raise HTTPException(status_code=404, detail="Registered microscopy image not found.")

    source_path = UPLOAD_DIR / record["stored_name"]
    if not source_path.is_file():
        raise HTTPException(status_code=404, detail="Stored microscopy image file is missing.")

    rgb, original_width, original_height = load_rgb_image(source_path)
    tissue, tumour, stroma, immune, candidates = analyse_compartments(rgb, parameters)

    run_id = str(uuid4())
    overlay_filename = f"{run_id}_overlay.png"
    compartments_filename = f"{run_id}_compartments.png"
    immune_mask_filename = f"{run_id}_immune_mask.png"

    overlay = build_overlay(rgb, tumour, stroma, immune)
    compartment_map = np.zeros_like(rgb)
    compartment_map[stroma > 0] = [60, 150, 245]
    compartment_map[tumour > 0] = [235, 90, 150]
    immune_map = np.zeros_like(rgb)
    immune_map[immune > 0] = [255, 255, 255]

    save_png(OUTPUT_DIR / overlay_filename, overlay)
    save_png(OUTPUT_DIR / compartments_filename, compartment_map)
    save_png(OUTPUT_DIR / immune_mask_filename, immune_map)

    total_pixels = int(tissue.size)
    tissue_count = int(np.count_nonzero(tissue))
    tumour_count = int(np.count_nonzero(tumour))
    stroma_count = int(np.count_nonzero(stroma))
    immune_count = len(candidates)
    near_count = sum(
        1 for item in candidates
        if item["spatial_group"] == "near_candidate_tumour_region"
    )
    far_count = sum(
        1 for item in candidates
        if item["spatial_group"] == "far_from_candidate_tumour_region"
    )

    grid_rows, grid_columns = 4, 4
    height, width = tissue.shape
    spatial_grid = []
    for row in range(grid_rows):
        for column in range(grid_columns):
            y0, y1 = row * height // grid_rows, (row + 1) * height // grid_rows
            x0, x1 = column * width // grid_columns, (column + 1) * width // grid_columns
            tile = candidates
            tile_count = sum(
                1 for item in tile
                if x0 <= item["centroid_x"] < x1 and y0 <= item["centroid_y"] < y1
            )
            spatial_grid.append({
                "row": row + 1,
                "column": column + 1,
                "candidate_count": tile_count,
            })

    results = {
        "source_dimensions": {"width": original_width, "height": original_height},
        "analysis_dimensions": {"width": int(width), "height": int(height)},
        "total_analysis_pixels": total_pixels,
        "tissue_area_pixels": tissue_count,
        "candidate_tumour_area_pixels": tumour_count,
        "candidate_stroma_area_pixels": stroma_count,
        "candidate_tumour_area_percent_of_tissue": round(
            tumour_count / tissue_count * 100, 2
        ) if tissue_count else 0,
        "candidate_stroma_area_percent_of_tissue": round(
            stroma_count / tissue_count * 100, 2
        ) if tissue_count else 0,
        "immune_like_candidate_count": immune_count,
        "immune_like_candidates_near_tumour": near_count,
        "immune_like_candidates_far_from_tumour": far_count,
        "candidate_density_per_10000_tissue_pixels": round(
            immune_count / tissue_count * 10000, 3
        ) if tissue_count else 0,
        "spatial_grid": spatial_grid,
        "candidates": candidates,
        "method": (
            "Experimental RGB/HSV colour heuristics, morphological cleanup, "
            "connected components and centroid-to-mask distance measurements."
        ),
        "limitations": [
            "Tumour-like and stroma-like areas are colour-based candidate compartments, not pathologist-annotated tissue classes.",
            "Immune-like regions are heuristic colour candidates, not verified lymphocytes or immune cells.",
            "The method is not a trained AI model and has no clinical or diagnostic validation.",
            "Colour thresholds are sensitive to stain variation, scanner settings, illumination and tissue preparation.",
            "Candidate regions may include artefacts, debris, non-target tissue or overlapping structures.",
            "Spatial proximity is measured between candidate centroids and the candidate tumour mask in analysis-thumbnail pixels.",
            "Measurements are pixel-based and are not calibrated to micrometres.",
            "SVS whole-slide images are analysed using a thumbnail rather than the full-resolution slide.",
            "Outputs must not be used for diagnosis, screening, treatment selection or patient management.",
        ],
    }

    parameter_data = parameters.model_dump()
    try:
        with engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO tumour_microenvironment_runs
                    (id, image_id, parameters, results, overlay_filename,
                     compartments_filename, immune_mask_filename)
                    VALUES (
                        :id, :image_id, CAST(:parameters AS JSONB),
                        CAST(:results AS JSONB), :overlay_filename,
                        :compartments_filename, :immune_mask_filename
                    )
                """),
                {
                    "id": run_id,
                    "image_id": image_id,
                    "parameters": json.dumps(parameter_data),
                    "results": json.dumps(results),
                    "overlay_filename": overlay_filename,
                    "compartments_filename": compartments_filename,
                    "immune_mask_filename": immune_mask_filename,
                },
            )
    except Exception:
        for filename in (overlay_filename, compartments_filename, immune_mask_filename):
            (OUTPUT_DIR / filename).unlink(missing_ok=True)
        raise

    return {
        "run_id": run_id,
        "image_id": image_id,
        "filename": record["original_name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "parameters": parameter_data,
        "results": results,
        "overlay_url": f"/api/v1/tumour-microenvironment/runs/{run_id}/overlay",
        "compartments_url": f"/api/v1/tumour-microenvironment/runs/{run_id}/compartments",
        "immune_mask_url": f"/api/v1/tumour-microenvironment/runs/{run_id}/immune-mask",
        "csv_url": f"/api/v1/tumour-microenvironment/runs/{run_id}/export.csv",
    }


def get_run(run_id: str):
    with engine.connect() as connection:
        row = connection.execute(
            text("""
                SELECT id, image_id, parameters, results, overlay_filename,
                       compartments_filename, immune_mask_filename, created_at
                FROM tumour_microenvironment_runs
                WHERE id = :id
            """),
            {"id": run_id},
        ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Tumour microenvironment run not found.")
    return row


def get_output_file(run_id: str, kind: str):
    row = get_run(run_id)
    columns = {
        "overlay": "overlay_filename",
        "compartments": "compartments_filename",
        "immune-mask": "immune_mask_filename",
    }
    filename = row[columns[kind]]
    path = (OUTPUT_DIR / filename).resolve()
    if path.parent != OUTPUT_DIR.resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Analysis output image not found.")
    return FileResponse(path, media_type="image/png", filename=filename)


@router.get("/runs/{run_id}/overlay")
def download_overlay(run_id: str):
    return get_output_file(run_id, "overlay")


@router.get("/runs/{run_id}/compartments")
def download_compartments(run_id: str):
    return get_output_file(run_id, "compartments")


@router.get("/runs/{run_id}/immune-mask")
def download_immune_mask(run_id: str):
    return get_output_file(run_id, "immune-mask")


@router.get("/runs/{run_id}")
def read_run(run_id: str):
    row = get_run(run_id)
    return {
        "run_id": row["id"],
        "image_id": row["image_id"],
        "parameters": row["parameters"],
        "results": row["results"],
        "created_at": row["created_at"].isoformat(),
        "overlay_url": f"/api/v1/tumour-microenvironment/runs/{row['id']}/overlay",
        "compartments_url": f"/api/v1/tumour-microenvironment/runs/{row['id']}/compartments",
        "immune_mask_url": f"/api/v1/tumour-microenvironment/runs/{row['id']}/immune-mask",
        "csv_url": f"/api/v1/tumour-microenvironment/runs/{row['id']}/export.csv",
    }


@router.get("/images/{image_id}/runs")
def get_history(image_id: str):
    with engine.connect() as connection:
        exists = connection.execute(
            text("SELECT id FROM microscopy_images WHERE id = :id"),
            {"id": image_id},
        ).first()
        if not exists:
            raise HTTPException(status_code=404, detail="Registered microscopy image not found.")
        rows = connection.execute(
            text("""
                SELECT id, parameters, results, created_at
                FROM tumour_microenvironment_runs
                WHERE image_id = :image_id
                ORDER BY created_at DESC
            """),
            {"image_id": image_id},
        ).mappings().all()

    return {
        "image_id": image_id,
        "runs": [{
            "run_id": row["id"],
            "parameters": row["parameters"],
            "results": row["results"],
            "created_at": row["created_at"].isoformat(),
            "overlay_url": f"/api/v1/tumour-microenvironment/runs/{row['id']}/overlay",
            "compartments_url": f"/api/v1/tumour-microenvironment/runs/{row['id']}/compartments",
            "immune_mask_url": f"/api/v1/tumour-microenvironment/runs/{row['id']}/immune-mask",
            "csv_url": f"/api/v1/tumour-microenvironment/runs/{row['id']}/export.csv",
        } for row in rows],
    }


@router.get("/runs/{run_id}/export.csv")
def export_candidates_csv(run_id: str):
    row = get_run(run_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "candidate_number", "area_pixels", "centroid_x", "centroid_y",
        "distance_to_tumour_pixels", "spatial_group",
        "bbox_x", "bbox_y", "bbox_width", "bbox_height",
    ])
    for item in row["results"].get("candidates", []):
        box = item["bounding_box"]
        writer.writerow([
            item["candidate_number"], item["area_pixels"],
            item["centroid_x"], item["centroid_y"],
            item.get("distance_to_tumour_pixels"),
            item.get("spatial_group"), box["x"], box["y"],
            box["width"], box["height"],
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="cytogenix_tme_{run_id}.csv"'},
    )
