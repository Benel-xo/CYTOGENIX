from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
import json

import cv2
import numpy as np
from PIL import Image, ImageOps
from sqlalchemy import text
from fastapi import APIRouter, HTTPException

from app.db.session import engine

router = APIRouter(prefix="/image-processing", tags=["Image Quality and Processing"])

PROJECT_ROOT = Path(__file__).resolve().parents[4]
UPLOAD_DIR = PROJECT_ROOT / "data" / "raw"


def initialise_table():
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS image_quality_reports (
                id VARCHAR(36) PRIMARY KEY,
                image_id VARCHAR(36) NOT NULL REFERENCES microscopy_images(id) ON DELETE CASCADE,
                metrics JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))


initialise_table()


def load_rgb_image(path: Path, extension: str):
    if extension == ".svs":
        try:
            import openslide
            slide = openslide.OpenSlide(str(path))
            width, height = slide.dimensions
            thumbnail = slide.get_thumbnail((2000, 2000)).convert("RGB")
            slide.close()
            return np.asarray(thumbnail), width, height
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not read whole-slide image: {exc}"
            )

    try:
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            width, height = image.size
            image.thumbnail((2000, 2000))
            return np.asarray(image), width, height
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not decode image: {exc}"
        )


def calculate_metrics(rgb: np.ndarray, width: int, height: int):
    # Measurements are calculated on a maximum 2000-pixel thumbnail.
    # They are image-quality indicators, not validated diagnostic measurements.
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    # Approximate tissue mask: saturated, non-near-white pixels.
    # This is a heuristic and is not a validated tissue segmentation algorithm.
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]
    tissue_mask = (saturation > 20) & (value < 245)
    tissue_percentage = float(np.mean(tissue_mask) * 100)

    rgb_means = {
        "red": round(float(np.mean(rgb[:, :, 0])), 2),
        "green": round(float(np.mean(rgb[:, :, 1])), 2),
        "blue": round(float(np.mean(rgb[:, :, 2])), 2),
    }

    saturation_mean = float(np.mean(saturation))

    return {
        "source_dimensions": {"width": width, "height": height},
        "analysis_dimensions": {
            "width": int(rgb.shape[1]),
            "height": int(rgb.shape[0])
        },
        "brightness_mean_0_255": round(brightness, 2),
        "grayscale_contrast_std_0_255": round(contrast, 2),
        "laplacian_variance_blur_indicator": round(blur_score, 2),
        "approximate_tissue_coverage_percent": round(tissue_percentage, 2),
        "mean_rgb": rgb_means,
        "mean_hsv_saturation_0_255": round(saturation_mean, 2),
        "analysis_method": "OpenCV thumbnail-based heuristic measurements",
        "limitations": [
            "Blur score depends on image resolution, content and acquisition settings.",
            "Tissue coverage is an approximate colour-threshold estimate, not segmentation.",
            "RGB values are not calibrated stain concentrations.",
            "SVS measurements use a thumbnail rather than full-resolution slide pixels.",
            "No cancer classification or clinical interpretation is performed."
        ]
    }


@router.post("/images/{image_id}/analyze")
def analyze_image(image_id: str):
    with engine.connect() as connection:
        record = connection.execute(
            text("""
                SELECT id, stored_name, file_format
                FROM microscopy_images
                WHERE id = :id
            """),
            {"id": image_id}
        ).mappings().first()

    if not record:
        raise HTTPException(status_code=404, detail="Registered image not found.")

    path = UPLOAD_DIR / record["stored_name"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Stored image file is missing.")

    extension = path.suffix.lower()
    rgb, width, height = load_rgb_image(path, extension)
    metrics = calculate_metrics(rgb, width, height)

    report_id = str(uuid4())

    with engine.begin() as connection:
        connection.execute(
            text("""
                INSERT INTO image_quality_reports (id, image_id, metrics)
                VALUES (:id, :image_id, CAST(:metrics AS JSONB))
            """),
            {
                "id": report_id,
                "image_id": image_id,
                "metrics": json.dumps(metrics)
            }
        )

    return {
        "report_id": report_id,
        "image_id": image_id,
        "filename": record["stored_name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics
    }


@router.get("/images/{image_id}/reports")
def get_image_reports(image_id: str):
    with engine.connect() as connection:
        exists = connection.execute(
            text("SELECT id FROM microscopy_images WHERE id = :id"),
            {"id": image_id}
        ).first()

        if not exists:
            raise HTTPException(status_code=404, detail="Registered image not found.")

        rows = connection.execute(
            text("""
                SELECT id, metrics, created_at
                FROM image_quality_reports
                WHERE image_id = :image_id
                ORDER BY created_at DESC
            """),
            {"image_id": image_id}
        ).mappings().all()

    return {
        "image_id": image_id,
        "reports": [
            {
                "report_id": row["id"],
                "created_at": row["created_at"].isoformat(),
                "metrics": row["metrics"]
            }
            for row in rows
        ]
    }
