from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
import csv
import io
import json

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text

from app.db.session import engine


router = APIRouter(
    prefix="/nuclear-morphometry",
    tags=["Nuclear Morphometry"]
)

PROJECT_ROOT = Path(__file__).resolve().parents[4]

CELLULAR_OUTPUT_DIR = (
    PROJECT_ROOT / "data" / "processed" / "cellular_intelligence"
)


def initialise_table():
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS nuclear_morphometry_runs (
                id VARCHAR(36) PRIMARY KEY,
                cellular_run_id VARCHAR(36) NOT NULL
                    REFERENCES cellular_intelligence_runs(id)
                    ON DELETE CASCADE,
                image_id VARCHAR(36) NOT NULL
                    REFERENCES microscopy_images(id)
                    ON DELETE CASCADE,
                results JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))


initialise_table()


def calculate_shape_measurements(mask: np.ndarray):
    """
    Calculate geometric measurements from connected components
    in a saved Cellular Intelligence binary mask.

    These measurements describe image regions. They do not establish
    that a region is an individual biological nucleus.
    """

    binary = (mask > 0).astype(np.uint8)

    component_count, labels, stats, centroids = (
        cv2.connectedComponentsWithStats(
            binary,
            connectivity=8
        )
    )

    measurements = []

    for label in range(1, component_count):
        area = int(stats[label, cv2.CC_STAT_AREA])

        if area <= 0:
            continue

        x = int(stats[label, cv2.CC_STAT_LEFT])
        y = int(stats[label, cv2.CC_STAT_TOP])
        width = int(stats[label, cv2.CC_STAT_WIDTH])
        height = int(stats[label, cv2.CC_STAT_HEIGHT])

        component_roi = (
            labels[y:y + height, x:x + width] == label
        ).astype(np.uint8)

        contours, _ = cv2.findContours(
            component_roi,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_NONE
        )

        if contours:
            contour = max(contours, key=cv2.contourArea)
            perimeter = float(cv2.arcLength(contour, True))
        else:
            perimeter = 0.0

        circularity = (
            (4.0 * np.pi * area) / (perimeter ** 2)
            if perimeter > 0
            else 0.0
        )

        circularity = max(0.0, min(1.0, circularity))
        irregularity = 1.0 - circularity

        # Estimate axes from the covariance of component pixel coordinates.
        local_y, local_x = np.where(component_roi > 0)

        if len(local_x) >= 2:
            coordinates = np.column_stack((
                local_x.astype(np.float64),
                local_y.astype(np.float64)
            ))

            covariance = np.cov(
                coordinates,
                rowvar=False,
                bias=True
            )

            eigenvalues = np.linalg.eigvalsh(covariance)
            eigenvalues = np.maximum(eigenvalues, 0)

            minor_eigenvalue = float(eigenvalues[0])
            major_eigenvalue = float(eigenvalues[1])

            major_axis = 4.0 * np.sqrt(major_eigenvalue)
            minor_axis = 4.0 * np.sqrt(minor_eigenvalue)

            aspect_ratio = (
                major_axis / minor_axis
                if minor_axis > 0
                else None
            )

            eccentricity = (
                np.sqrt(
                    max(
                        0.0,
                        1.0 - (
                            minor_eigenvalue / major_eigenvalue
                        )
                    )
                )
                if major_eigenvalue > 0
                else 0.0
            )
        else:
            major_axis = 0.0
            minor_axis = 0.0
            aspect_ratio = None
            eccentricity = 0.0

        equivalent_diameter = np.sqrt(
            (4.0 * area) / np.pi
        )

        measurements.append({
            "region_number": len(measurements) + 1,
            "area_pixels": area,
            "perimeter_pixels": round(perimeter, 3),
            "major_axis_pixels": round(float(major_axis), 3),
            "minor_axis_pixels": round(float(minor_axis), 3),
            "aspect_ratio": (
                round(float(aspect_ratio), 4)
                if aspect_ratio is not None
                else None
            ),
            "eccentricity": round(float(eccentricity), 4),
            "equivalent_diameter_pixels": round(
                float(equivalent_diameter), 3
            ),
            "circularity": round(float(circularity), 4),
            "shape_irregularity": round(float(irregularity), 4),
            "centroid_x": round(float(centroids[label][0]), 2),
            "centroid_y": round(float(centroids[label][1]), 2),
            "bounding_box": {
                "x": x,
                "y": y,
                "width": width,
                "height": height
            }
        })

    return measurements


def calculate_summary(measurements):
    metric_names = [
        "area_pixels",
        "perimeter_pixels",
        "major_axis_pixels",
        "minor_axis_pixels",
        "aspect_ratio",
        "eccentricity",
        "equivalent_diameter_pixels",
        "circularity",
        "shape_irregularity"
    ]

    summary = {}

    for metric in metric_names:
        values = [
            item[metric]
            for item in measurements
            if item[metric] is not None
        ]

        if not values:
            summary[metric] = {
                "mean": None,
                "median": None,
                "minimum": None,
                "maximum": None,
                "standard_deviation": None
            }
            continue

        array = np.asarray(values, dtype=np.float64)

        summary[metric] = {
            "mean": round(float(np.mean(array)), 4),
            "median": round(float(np.median(array)), 4),
            "minimum": round(float(np.min(array)), 4),
            "maximum": round(float(np.max(array)), 4),
            "standard_deviation": round(
                float(np.std(array)), 4
            )
        }

    areas = np.asarray(
        [item["area_pixels"] for item in measurements],
        dtype=np.float64
    )

    mean_area = float(np.mean(areas)) if len(areas) else 0.0
    area_std = float(np.std(areas)) if len(areas) else 0.0

    summary["area_coefficient_of_variation_percent"] = (
        round((area_std / mean_area) * 100.0, 3)
        if mean_area > 0
        else None
    )

    return summary


def calculate_area_distribution(measurements):
    areas = [
        item["area_pixels"]
        for item in measurements
    ]

    if not areas:
        return []

    counts, edges = np.histogram(
        areas,
        bins=min(8, max(1, len(areas)))
    )

    distribution = []

    for index, count in enumerate(counts):
        distribution.append({
            "range_start": round(float(edges[index]), 2),
            "range_end": round(float(edges[index + 1]), 2),
            "count": int(count)
        })

    return distribution


@router.post("/cellular-runs/{cellular_run_id}/analyze")
def run_nuclear_morphometry(cellular_run_id: str):
    with engine.connect() as connection:
        source = connection.execute(
            text("""
                SELECT
                    c.id,
                    c.image_id,
                    c.mask_filename,
                    c.results AS cellular_results,
                    i.original_name
                FROM cellular_intelligence_runs c
                JOIN microscopy_images i
                    ON i.id = c.image_id
                WHERE c.id = :run_id
            """),
            {"run_id": cellular_run_id}
        ).mappings().first()

    if not source:
        raise HTTPException(
            status_code=404,
            detail="Cellular Intelligence analysis run not found."
        )

    mask_path = (
        CELLULAR_OUTPUT_DIR / source["mask_filename"]
    ).resolve()

    if (
        mask_path.parent != CELLULAR_OUTPUT_DIR.resolve()
        or not mask_path.is_file()
    ):
        raise HTTPException(
            status_code=404,
            detail="The saved Cellular Intelligence mask could not be found."
        )

    mask = cv2.imread(
        str(mask_path),
        cv2.IMREAD_GRAYSCALE
    )

    if mask is None:
        raise HTTPException(
            status_code=422,
            detail="The saved cellular mask could not be decoded."
        )

    measurements = calculate_shape_measurements(mask)
    summary = calculate_summary(measurements)

    height, width = mask.shape

    results = {
        "source": {
            "cellular_run_id": cellular_run_id,
            "image_id": source["image_id"],
            "filename": source["original_name"],
            "analysis_width_pixels": int(width),
            "analysis_height_pixels": int(height)
        },
        "region_count": len(measurements),
        "summary": summary,
        "area_distribution": calculate_area_distribution(
            measurements
        ),
        "measurements": measurements,
        "method": (
            "Connected-component geometry calculated from the "
            "saved Cellular Intelligence binary mask. Major and "
            "minor axes are covariance-based ellipse estimates."
        ),
        "limitations": [
            "Measurements describe candidate image regions, not verified biological nuclei.",
            "The source mask was generated by heuristic colour filtering, not a trained cell detector.",
            "Touching regions may have been merged during the original segmentation.",
            "Major and minor axes are covariance-based estimates, not manually annotated nuclear axes.",
            "Circularity and shape irregularity depend on the pixel boundary and image resolution.",
            "All measurements use analysis-thumbnail pixels and pixels squared.",
            "No micrometre calibration is available in the current workflow.",
            "No clinical, diagnostic or biological validation has been performed."
        ]
    }

    morphometry_run_id = str(uuid4())

    try:
        with engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO nuclear_morphometry_runs
                    (
                        id,
                        cellular_run_id,
                        image_id,
                        results
                    )
                    VALUES (
                        :id,
                        :cellular_run_id,
                        :image_id,
                        CAST(:results AS JSONB)
                    )
                """),
                {
                    "id": morphometry_run_id,
                    "cellular_run_id": cellular_run_id,
                    "image_id": source["image_id"],
                    "results": json.dumps(results)
                }
            )
    except Exception:
        raise

    return {
        "run_id": morphometry_run_id,
        "cellular_run_id": cellular_run_id,
        "image_id": source["image_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "results": results
    }


@router.get("/cellular-runs/{cellular_run_id}/history")
def get_morphometry_history(cellular_run_id: str):
    with engine.connect() as connection:
        source_exists = connection.execute(
            text("""
                SELECT id
                FROM cellular_intelligence_runs
                WHERE id = :id
            """),
            {"id": cellular_run_id}
        ).first()

        if not source_exists:
            raise HTTPException(
                status_code=404,
                detail="Cellular Intelligence analysis run not found."
            )

        rows = connection.execute(
            text("""
                SELECT id, results, created_at
                FROM nuclear_morphometry_runs
                WHERE cellular_run_id = :cellular_run_id
                ORDER BY created_at DESC
            """),
            {"cellular_run_id": cellular_run_id}
        ).mappings().all()

    return {
        "cellular_run_id": cellular_run_id,
        "runs": [
            {
                "run_id": row["id"],
                "results": row["results"],
                "created_at": row["created_at"].isoformat()
            }
            for row in rows
        ]
    }


@router.get("/runs/{run_id}")
def get_morphometry_run(run_id: str):
    with engine.connect() as connection:
        row = connection.execute(
            text("""
                SELECT id, cellular_run_id, image_id, results, created_at
                FROM nuclear_morphometry_runs
                WHERE id = :id
            """),
            {"id": run_id}
        ).mappings().first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Nuclear Morphometry run not found."
        )

    return {
        "run_id": row["id"],
        "cellular_run_id": row["cellular_run_id"],
        "image_id": row["image_id"],
        "created_at": row["created_at"].isoformat(),
        "results": row["results"]
    }


@router.get("/runs/{run_id}/export.csv")
def export_morphometry_csv(run_id: str):
    with engine.connect() as connection:
        row = connection.execute(
            text("""
                SELECT id, results
                FROM nuclear_morphometry_runs
                WHERE id = :id
            """),
            {"id": run_id}
        ).mappings().first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Nuclear Morphometry run not found."
        )

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Region",
        "Area (pixels squared)",
        "Perimeter (pixels)",
        "Major axis (pixels)",
        "Minor axis (pixels)",
        "Aspect ratio",
        "Eccentricity",
        "Equivalent diameter (pixels)",
        "Circularity",
        "Shape irregularity",
        "Centroid X",
        "Centroid Y"
    ])

    for item in row["results"]["measurements"]:
        writer.writerow([
            item["region_number"],
            item["area_pixels"],
            item["perimeter_pixels"],
            item["major_axis_pixels"],
            item["minor_axis_pixels"],
            item["aspect_ratio"],
            item["eccentricity"],
            item["equivalent_diameter_pixels"],
            item["circularity"],
            item["shape_irregularity"],
            item["centroid_x"],
            item["centroid_y"]
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f'attachment; filename="cytogenix_morphometry_{run_id}.csv"'
            )
        }
    )