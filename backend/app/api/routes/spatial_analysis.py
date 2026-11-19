from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import csv
import io
import json
import math

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.db.session import engine

router = APIRouter(prefix="/spatial-analysis", tags=["Spatial Analysis"])

PROJECT_ROOT = Path(__file__).resolve().parents[4]
UPLOAD_DIR = PROJECT_ROOT / "data" / "raw"
OUTPUT_DIR = PROJECT_ROOT / "data" / "processed" / "spatial_analysis"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class SpatialParameters(BaseModel):
    grid_rows: int = Field(default=6, ge=2, le=20)
    grid_columns: int = Field(default=6, ge=2, le=20)
    cluster_epsilon_pixels: float = Field(default=45.0, ge=1.0, le=2000.0)
    minimum_cluster_points: int = Field(default=4, ge=2, le=100)


def ensure_table() -> None:
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS spatial_analysis_runs (
                id VARCHAR(36) PRIMARY KEY,
                morphometry_run_id VARCHAR(36) NOT NULL
                    REFERENCES nuclear_morphometry_runs(id) ON DELETE CASCADE,
                image_id VARCHAR(36) NOT NULL
                    REFERENCES microscopy_images(id) ON DELETE CASCADE,
                parameters JSONB NOT NULL,
                results JSONB NOT NULL,
                overlay_filename TEXT,
                density_filename TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        connection.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_spatial_analysis_morphometry
            ON spatial_analysis_runs(morphometry_run_id)
        """))
        connection.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_spatial_analysis_image
            ON spatial_analysis_runs(image_id)
        """))


def load_analysis_image(path: Path, width: int, height: int) -> np.ndarray:
    if not path.exists():
        raise HTTPException(status_code=404, detail="Source microscopy image file was not found.")
    if path.suffix.lower() == ".svs":
        try:
            import openslide
            slide = openslide.OpenSlide(str(path))
            thumb = slide.get_thumbnail((2000, 2000)).convert("RGB")
            image = cv2.cvtColor(np.asarray(thumb), cv2.COLOR_RGB2BGR)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not read the SVS image: {exc}") from exc
    else:
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image is None:
            raise HTTPException(status_code=422, detail="Could not decode the source image.")
        h, w = image.shape[:2]
        scale = min(1.0, 2000 / max(h, w))
        if scale < 1:
            image = cv2.resize(image, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_AREA)
    if image.shape[1] != width or image.shape[0] != height:
        image = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)
    return image


def dbscan(points: np.ndarray, eps: float, min_samples: int) -> np.ndarray:
    """Deterministic DBSCAN using spatial buckets; no additional ML dependency."""
    n = len(points)
    labels = np.full(n, -2, dtype=np.int32)  # -2 = unvisited, -1 = noise
    if n == 0:
        return labels
    cell = max(float(eps), 1.0)
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    keys = [(math.floor(float(x) / cell), math.floor(float(y) / cell)) for x, y in points]
    for index, key in enumerate(keys):
        buckets[key].append(index)

    def neighbours(index: int) -> list[int]:
        gx, gy = keys[index]
        found: list[int] = []
        p = points[index]
        eps2 = eps * eps
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for candidate in buckets.get((gx + dx, gy + dy), []):
                    delta = points[candidate] - p
                    if float(delta[0] * delta[0] + delta[1] * delta[1]) <= eps2:
                        found.append(candidate)
        return found

    cluster_id = 0
    for index in range(n):
        if labels[index] != -2:
            continue
        near = neighbours(index)
        if len(near) < min_samples:
            labels[index] = -1
            continue
        labels[index] = cluster_id
        queue = deque(near)
        queued = set(near)
        while queue:
            candidate = queue.popleft()
            if labels[candidate] == -1:
                labels[candidate] = cluster_id
            if labels[candidate] != -2:
                continue
            labels[candidate] = cluster_id
            candidate_near = neighbours(candidate)
            if len(candidate_near) >= min_samples:
                for item in candidate_near:
                    if item not in queued:
                        queued.add(item)
                        queue.append(item)
        cluster_id += 1
    return labels


def nearest_neighbour_distances(points: np.ndarray) -> list[float]:
    n = len(points)
    if n < 2:
        return []
    try:
        from scipy.spatial import cKDTree
        distances, _ = cKDTree(points).query(points, k=2)
        return [float(v) for v in distances[:, 1] if np.isfinite(v)]
    except Exception:
        # Memory-bounded exact fallback. This is slower for very large point sets.
        output = []
        block = 256
        for start in range(0, n, block):
            part = points[start:start + block]
            delta = part[:, None, :] - points[None, :, :]
            squared = np.sum(delta * delta, axis=2)
            rows = np.arange(len(part))
            squared[rows, np.arange(start, start + len(part))] = np.inf
            output.extend(np.sqrt(np.min(squared, axis=1)).astype(float).tolist())
        return output


def safe_stats(values: list[float]) -> dict:
    if not values:
        return {"count": 0, "mean": None, "median": None, "std": None, "min": None, "max": None}
    arr = np.asarray(values, dtype=np.float64)
    return {
        "count": int(arr.size),
        "mean": float(np.mean(arr)),
        "median": float(np.median(arr)),
        "std": float(np.std(arr)),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
    }


def create_visuals(image: np.ndarray, points: np.ndarray, labels: np.ndarray,
                   rows: int, columns: int, overlay_path: Path, density_path: Path) -> list:
    height, width = image.shape[:2]
    overlay = image.copy()
    palette = [
        (70, 210, 130), (220, 130, 70), (210, 80, 210), (70, 180, 240),
        (230, 210, 70), (180, 100, 240), (80, 220, 220), (240, 140, 150),
    ]
    total = len(points)
    stride = max(1, math.ceil(total / 6000))
    for i in range(0, total, stride):
        x = int(np.clip(round(points[i, 0]), 0, width - 1))
        y = int(np.clip(round(points[i, 1]), 0, height - 1))
        label = int(labels[i]) if i < len(labels) else -1
        color = (145, 145, 145) if label < 0 else palette[label % len(palette)]
        cv2.circle(overlay, (x, y), 3, color, -1, lineType=cv2.LINE_AA)
    cv2.imwrite(str(overlay_path), overlay)

    counts = np.zeros((rows, columns), dtype=np.int32)
    for x, y in points:
        col = min(columns - 1, max(0, int(float(x) / max(width, 1) * columns)))
        row = min(rows - 1, max(0, int(float(y) / max(height, 1) * rows)))
        counts[row, col] += 1
    tile_w = max(1, width // columns)
    tile_h = max(1, height // rows)
    density = np.zeros((height, width), dtype=np.uint8)
    maximum = max(1, int(counts.max()) if counts.size else 1)
    for row in range(rows):
        for col in range(columns):
            intensity = int(round(counts[row, col] / maximum * 255))
            x1, y1 = col * tile_w, row * tile_h
            x2 = width if col == columns - 1 else min(width, (col + 1) * tile_w)
            y2 = height if row == rows - 1 else min(height, (row + 1) * tile_h)
            density[y1:y2, x1:x2] = intensity
            cv2.rectangle(density, (x1, y1), (max(x1, x2 - 1), max(y1, y2 - 1)), 255, 1)
            cv2.putText(density, str(int(counts[row, col])), (x1 + 5, y1 + 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, 255, 1, cv2.LINE_AA)
    colored = cv2.applyColorMap(density, cv2.COLORMAP_TURBO)
    cv2.imwrite(str(density_path), colored)
    grid = [
        {"row": r + 1, "column": c + 1, "candidate_count": int(counts[r, c])}
        for r in range(rows) for c in range(columns)
    ]
    return grid


def asset_url(run_id: str, kind: str) -> str:
    return f"/api/v1/spatial-analysis/runs/{run_id}/{kind}"


@router.post("/morphometry-runs/{morphometry_run_id}/analyze")
def analyse_spatial_distribution(morphometry_run_id: str, parameters: SpatialParameters):
    ensure_table()
    with engine.begin() as connection:
        morph = connection.execute(
            text("SELECT id, image_id, results FROM nuclear_morphometry_runs WHERE id = :id"),
            {"id": morphometry_run_id},
        ).mappings().first()
        if not morph:
            raise HTTPException(status_code=404, detail="Nuclear Morphometry run not found.")
        image_record = connection.execute(
            text("SELECT original_name, stored_name FROM microscopy_images WHERE id = :id"),
            {"id": morph["image_id"]},
        ).mappings().first()
    if not image_record:
        raise HTTPException(status_code=404, detail="Linked microscopy image was not found.")

    morph_results = morph["results"] or {}
    source = morph_results.get("source", {})
    width = int(source.get("analysis_width_pixels") or 0)
    height = int(source.get("analysis_height_pixels") or 0)
    if width < 1 or height < 1:
        raise HTTPException(status_code=422, detail="Morphometry run does not contain valid analysis dimensions.")
    measurements = morph_results.get("measurements") or []
    points_list = []
    candidate_rows = []
    for item in measurements:
        try:
            x, y = float(item["centroid_x"]), float(item["centroid_y"])
            if math.isfinite(x) and math.isfinite(y):
                points_list.append((x, y))
                candidate_rows.append(item)
        except (KeyError, TypeError, ValueError):
            continue
    points = np.asarray(points_list, dtype=np.float64).reshape((-1, 2))
    labels = dbscan(points, parameters.cluster_epsilon_pixels, parameters.minimum_cluster_points)
    distances = nearest_neighbour_distances(points)

    rows, columns = parameters.grid_rows, parameters.grid_columns
    counts = np.zeros((rows, columns), dtype=np.int32)
    for x, y in points:
        col = min(columns - 1, max(0, int(x / width * columns)))
        row = min(rows - 1, max(0, int(y / height * rows)))
        counts[row, col] += 1
    tile_area = (width / columns) * (height / rows)
    densities = counts.astype(float) / max(tile_area, 1.0) * 10000.0
    total = len(points)
    occupied = int(np.count_nonzero(counts))
    mean_count = float(np.mean(counts)) if counts.size else 0.0
    count_std = float(np.std(counts)) if counts.size else 0.0
    cv_percent = (count_std / mean_count * 100.0) if mean_count > 0 else None
    if total and occupied > 1:
        probabilities = counts[counts > 0].astype(float) / total
        entropy = float(-np.sum(probabilities * np.log(probabilities)))
        effective_tiles = float(np.exp(entropy))
        normalized_entropy = float(entropy / math.log(rows * columns)) if rows * columns > 1 else 0.0
    elif total:
        entropy, effective_tiles, normalized_entropy = 0.0, 1.0, 0.0
    else:
        entropy, effective_tiles, normalized_entropy = None, 0.0, None

    cluster_ids = sorted({int(v) for v in labels if v >= 0})
    cluster_sizes = {str(cid): int(np.sum(labels == cid)) for cid in cluster_ids}
    noise_count = int(np.sum(labels == -1))
    nearest_stats = safe_stats(distances)
    image_path = UPLOAD_DIR / image_record["stored_name"]
    image = load_analysis_image(image_path, width, height)

    run_id = str(uuid4())
    overlay_filename = f"{run_id}_overlay.png"
    density_filename = f"{run_id}_density.png"
    overlay_path = OUTPUT_DIR / overlay_filename
    density_path = OUTPUT_DIR / density_filename
    spatial_grid = create_visuals(image, points, labels, rows, columns, overlay_path, density_path)

    candidates = []
    for index, item in enumerate(candidate_rows):
        candidates.append({
            "region_number": item.get("region_number", index + 1),
            "area_pixels": item.get("area_pixels"),
            "centroid_x": float(points[index, 0]),
            "centroid_y": float(points[index, 1]),
            "cluster_id": int(labels[index]) if labels[index] >= 0 else None,
            "is_noise": bool(labels[index] == -1),
            "nearest_neighbour_distance_pixels": distances[index] if index < len(distances) else None,
        })

    results = {
        "source": {
            "image_id": str(morph["image_id"]),
            "filename": image_record["original_name"],
            "morphometry_run_id": morphometry_run_id,
            "analysis_width_pixels": width,
            "analysis_height_pixels": height,
            "candidate_count": total,
        },
        "spatial_summary": {
            "candidate_count": total,
            "cluster_count": len(cluster_ids),
            "noise_candidate_count": noise_count,
            "clustered_candidate_percent": (float((total - noise_count) / total * 100) if total else None),
            "largest_cluster_size": max(cluster_sizes.values()) if cluster_sizes else 0,
            "occupied_tiles": occupied,
            "total_tiles": rows * columns,
            "occupied_tile_percent": float(occupied / (rows * columns) * 100),
            "mean_candidates_per_tile": mean_count,
            "tile_count_std": count_std,
            "tile_count_cv_percent": cv_percent,
            "shannon_entropy": entropy,
            "effective_occupied_tiles": effective_tiles,
            "normalized_spatial_entropy": normalized_entropy,
        },
        "nearest_neighbour": nearest_stats,
        "clusters": [{"cluster_id": int(k), "candidate_count": v} for k, v in cluster_sizes.items()],
        "spatial_grid": spatial_grid,
        "candidates": candidates,
        "parameters": parameters.model_dump(),
        "method": (
            "Centroid-based spatial analysis of candidate regions previously measured by Nuclear Morphometry. "
            "DBSCAN clusters are calculated with Euclidean pixel distance. Equal-sized image tiles are used "
            "for regional counts and density summaries. Nearest-neighbour distances use exact Euclidean "
            "nearest-neighbour search when SciPy is available, with a memory-bounded exact fallback."
        ),
        "limitations": [
            "This analysis inherits the heuristic candidate-region mask produced by Cellular Intelligence; candidates are not verified nuclei or cells.",
            "DBSCAN clusters describe geometric proximity only and do not establish biological cell populations or tissue compartments.",
            "Coordinates, areas and distances are expressed in analysis-image pixels; no physical calibration in micrometres is available.",
            "Images may have been downsampled to analysis dimensions, so measurements do not represent full-resolution whole-slide coordinates.",
            "Regional heterogeneity metrics depend on the selected grid dimensions and should not be interpreted as validated biological heterogeneity scores.",
            "The overlay displays all calculations but draws at most approximately 6,000 centroid markers for readability.",
            "This experimental research output is not clinically validated and must not be used for diagnosis or patient management.",
        ],
    }
    with engine.begin() as connection:
        connection.execute(
            text("""
                INSERT INTO spatial_analysis_runs
                (id, morphometry_run_id, image_id, parameters, results, overlay_filename, density_filename, created_at)
                VALUES (:id, :morphometry_run_id, :image_id, CAST(:parameters AS jsonb),
                        CAST(:results AS jsonb), :overlay_filename, :density_filename, :created_at)
            """),
            {
                "id": run_id,
                "morphometry_run_id": morphometry_run_id,
                "image_id": morph["image_id"],
                "parameters": json.dumps(parameters.model_dump()),
                "results": json.dumps(results),
                "overlay_filename": overlay_filename,
                "density_filename": density_filename,
                "created_at": datetime.now(timezone.utc),
            },
        )
    return {
        "run_id": run_id,
        "morphometry_run_id": morphometry_run_id,
        "image_id": str(morph["image_id"]),
        "filename": image_record["original_name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "results": results,
        "overlay_url": asset_url(run_id, "overlay"),
        "density_url": asset_url(run_id, "density-map"),
        "csv_url": asset_url(run_id, "export.csv"),
    }


@router.get("/morphometry-runs/{morphometry_run_id}/history")
def spatial_history(morphometry_run_id: str):
    ensure_table()
    with engine.begin() as connection:
        rows = connection.execute(
            text("""
                SELECT id, morphometry_run_id, image_id, results, created_at
                FROM spatial_analysis_runs
                WHERE morphometry_run_id = :id
                ORDER BY created_at DESC
            """),
            {"id": morphometry_run_id},
        ).mappings().all()
    return {"runs": [
        {
            "run_id": row["id"],
            "morphometry_run_id": row["morphometry_run_id"],
            "image_id": row["image_id"],
            "results": row["results"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "overlay_url": asset_url(row["id"], "overlay"),
            "density_url": asset_url(row["id"], "density-map"),
            "csv_url": asset_url(row["id"], "export.csv"),
        } for row in rows
    ]}


def get_saved_run(run_id: str):
    ensure_table()
    with engine.begin() as connection:
        row = connection.execute(
            text("""
                SELECT id, morphometry_run_id, image_id, results, created_at,
                       overlay_filename, density_filename
                FROM spatial_analysis_runs WHERE id = :id
            """),
            {"id": run_id},
        ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Spatial Analysis run not found.")
    return row


@router.get("/runs/{run_id}")
def read_spatial_run(run_id: str):
    row = get_saved_run(run_id)
    with engine.begin() as connection:
        image = connection.execute(
            text("SELECT original_name FROM microscopy_images WHERE id = :id"),
            {"id": row["image_id"]},
        ).mappings().first()
    return {
        "run_id": row["id"],
        "morphometry_run_id": row["morphometry_run_id"],
        "image_id": row["image_id"],
        "filename": image["original_name"] if image else None,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "results": row["results"],
        "overlay_url": asset_url(run_id, "overlay"),
        "density_url": asset_url(run_id, "density-map"),
        "csv_url": asset_url(run_id, "export.csv"),
    }


@router.get("/runs/{run_id}/overlay")
def spatial_overlay(run_id: str):
    row = get_saved_run(run_id)
    path = OUTPUT_DIR / row["overlay_filename"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Overlay file is unavailable.")
    return FileResponse(path, media_type="image/png", filename=path.name)


@router.get("/runs/{run_id}/density-map")
def spatial_density_map(run_id: str):
    row = get_saved_run(run_id)
    path = OUTPUT_DIR / row["density_filename"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Density map is unavailable.")
    return FileResponse(path, media_type="image/png", filename=path.name)


@router.get("/runs/{run_id}/export.csv")
def export_spatial_csv(run_id: str):
    row = get_saved_run(run_id)
    results = row["results"] or {}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["region_number", "area_pixels", "centroid_x", "centroid_y",
                     "cluster_id", "is_noise", "nearest_neighbour_distance_pixels"])
    for item in results.get("candidates", []):
        writer.writerow([
            item.get("region_number"), item.get("area_pixels"), item.get("centroid_x"),
            item.get("centroid_y"), item.get("cluster_id"), item.get("is_noise"),
            item.get("nearest_neighbour_distance_pixels"),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="cytogenix_spatial_{run_id}.csv"'},
    )
