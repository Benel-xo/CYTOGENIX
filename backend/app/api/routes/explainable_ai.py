from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.db.session import engine

router = APIRouter(prefix="/explainable-ai", tags=["Explainable AI"])

# Table and column names are fixed here; user input is never interpolated into SQL.
SOURCE_TABLES = {
    "cellular-intelligence": {
        "table": "cellular_intelligence_runs",
        "result_column": "results",
        "parameter_column": "parameters",
    },
    "nuclear-morphometry": {
        "table": "nuclear_morphometry_runs",
        "result_column": "results",
        "parameter_column": None,
    },
    "tumour-microenvironment": {
        "table": "tumour_microenvironment_runs",
        "result_column": "results",
        "parameter_column": "parameters",
    },
    "spatial-analysis": {
        "table": "spatial_analysis_runs",
        "result_column": "results",
        "parameter_column": "parameters",
    },
}

METRIC_GUIDANCE = {
    "detected_nuclei_count": ("Candidate regions detected", "Count of connected image regions identified by the Cellular Intelligence heuristic. These are not confirmed biological nuclei."),
    "region_count": ("Measured regions", "Number of connected candidate regions for which geometric measurements were calculated."),
    "candidate_count": ("Candidate regions", "Number of candidate centroids included in this spatial calculation. It inherits the limitations of the upstream segmentation."),
    "mean_area_pixels": ("Mean candidate area", "Average candidate-region area in analysis-image pixels squared. It is not a physical area measurement."),
    "mean_circularity": ("Mean circularity", "Average 4π × area / perimeter² for candidate regions. Values closer to 1 indicate a more circular pixel boundary; this is not a cell identity or malignancy score."),
    "area_coefficient_of_variation_percent": ("Area variability", "Standard deviation divided by mean area, expressed as a percentage. It describes variation in measured candidate-region sizes in this image."),
    "cluster_count": ("Geometric clusters", "Number of DBSCAN groups under the selected distance and minimum-point settings. Groups describe proximity only, not biological populations."),
    "noise_candidate_count": ("Unclustered candidates", "Number of candidate points not assigned to a DBSCAN cluster using the selected settings."),
    "clustered_candidate_percent": ("Candidates in clusters", "Percentage assigned to a geometric cluster under the selected DBSCAN settings."),
    "occupied_tiles": ("Occupied image tiles", "Number of grid tiles containing at least one candidate centroid."),
    "normalized_spatial_entropy": ("Normalized spatial entropy", "A grid-dependent summary of how candidate counts are distributed across tiles. It is not a validated biological heterogeneity score."),
    "tile_count_cv_percent": ("Tile-count variability", "Coefficient of variation of candidate counts across equal-sized grid tiles. It depends on the selected grid dimensions."),
    "mean": ("Mean", "Arithmetic average of the reported measurement values."),
    "median": ("Median", "Middle value after sorting the reported measurement values."),
    "standard_deviation": ("Standard deviation", "Describes the spread of the reported measurements around their mean."),
}


def _iso(value: Any) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else (str(value) if value is not None else None)


def _number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _collect_metrics(results: dict[str, Any]) -> list[dict[str, Any]]:
    """Collect a compact, explainable set of numeric summary values."""
    metrics: list[dict[str, Any]] = []
    preferred_sections = [
        ("spatial_summary", results.get("spatial_summary")),
        ("summary", results.get("summary")),
        ("statistics", results.get("statistics")),
    ]
    seen: set[str] = set()
    for section_name, section in preferred_sections:
        if not isinstance(section, dict):
            continue
        for key, value in section.items():
            if _number(value) and key not in seen:
                title, explanation = METRIC_GUIDANCE.get(
                    key, (key.replace("_", " ").capitalize(),
                          "Numeric summary value stored by the selected analysis. Refer to the method and limitations before interpreting it.")
                )
                metrics.append({"key": key, "label": title, "value": value, "explanation": explanation, "section": section_name})
                seen.add(key)
            elif isinstance(value, dict):
                for statistic, statistic_value in value.items():
                    if _number(statistic_value):
                        metric_key = f"{key}.{statistic}"
                        metric_title = f"{key.replace('_', ' ').capitalize()} · {statistic}"
                        statistic_explanations = {
                            "mean": "Arithmetic average of the measured candidate-region values.",
                            "median": "Middle value after sorting the measured candidate-region values.",
                            "minimum": "Smallest measured value in this analysis run.",
                            "maximum": "Largest measured value in this analysis run.",
                            "standard_deviation": "Describes the spread of measurements around their mean.",
                        }
                        metrics.append({"key": metric_key, "label": metric_title, "value": statistic_value,
                                        "explanation": statistic_explanations.get(statistic, "Stored descriptive statistic; interpret it in the context of the method and limitations."),
                                        "section": section_name})
                        seen.add(metric_key)

    # Include useful top-level counts when a module has no summary object.
    for key in ("region_count", "candidate_count", "detected_nuclei_count", "tissue_coverage_percent", "immune_candidate_count", "tumour_candidate_count", "stroma_candidate_count"):
        value = results.get(key)
        if _number(value) and key not in seen:
            title, explanation = METRIC_GUIDANCE.get(
                key, (key.replace("_", " ").capitalize(), "Count or measurement reported by the selected heuristic image-analysis workflow.")
            )
            metrics.append({"key": key, "label": title, "value": value, "explanation": explanation, "section": "results"})
            seen.add(key)
    return metrics[:30]


def _build_explanation(source_type: str, run_id: str, row: Any) -> dict[str, Any]:
    results = row["results"] or {}
    if isinstance(results, str):
        import json
        results = json.loads(results)
    if not isinstance(results, dict):
        results = {}

    parameters = row.get("parameters") if hasattr(row, "get") else None
    if isinstance(parameters, str):
        import json
        parameters = json.loads(parameters)
    if not isinstance(parameters, dict):
        parameters = {}

    source = results.get("source") if isinstance(results.get("source"), dict) else {}
    method = results.get("method") or "The source analysis did not store a method description."
    limitations = results.get("limitations") or []
    if isinstance(limitations, str):
        limitations = [limitations]

    labels = {
        "cellular-intelligence": "Cellular Intelligence",
        "nuclear-morphometry": "Nuclear Morphometry",
        "tumour-microenvironment": "Tumour Microenvironment",
        "spatial-analysis": "Spatial Analysis",
    }
    metrics = _collect_metrics(results)
    return {
        "run_id": run_id,
        "source_type": source_type,
        "source_label": labels[source_type],
        "image_id": str(row["image_id"]),
        "filename": row["original_name"],
        "created_at": _iso(row["created_at"]),
        "source_metadata": source,
        "metrics": metrics,
        "parameters": parameters,
        "method": method,
        "limitations": limitations,
        "explanation_type": "Deterministic metric and method documentation; no trained explainability model was run.",
        "interpretation_notice": "These explanations describe stored computational measurements. They do not establish diagnosis, malignancy, cell identity, clinical risk, or biological causation.",
    }


@router.get("/sources")
def list_explainable_sources():
    """List saved runs from the four currently integrated research modules."""
    sources: list[dict[str, Any]] = []
    queries = [
        ("cellular-intelligence", """
            SELECT r.id, r.image_id, i.original_name, r.created_at
            FROM cellular_intelligence_runs r
            JOIN microscopy_images i ON i.id = r.image_id
            ORDER BY r.created_at DESC LIMIT 100
        """),
        ("nuclear-morphometry", """
            SELECT r.id, r.image_id, i.original_name, r.created_at
            FROM nuclear_morphometry_runs r
            JOIN microscopy_images i ON i.id = r.image_id
            ORDER BY r.created_at DESC LIMIT 100
        """),
        ("tumour-microenvironment", """
            SELECT r.id, r.image_id, i.original_name, r.created_at
            FROM tumour_microenvironment_runs r
            JOIN microscopy_images i ON i.id = r.image_id
            ORDER BY r.created_at DESC LIMIT 100
        """),
        ("spatial-analysis", """
            SELECT r.id, r.image_id, i.original_name, r.created_at
            FROM spatial_analysis_runs r
            JOIN microscopy_images i ON i.id = r.image_id
            ORDER BY r.created_at DESC LIMIT 100
        """),
    ]
    try:
        # Spatial Analysis creates its history table on first analysis; initialise it
        # here as well so an empty workspace can still list other module runs.
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
        with engine.connect() as connection:
            for source_type, query in queries:
                rows = connection.execute(text(query)).mappings().all()
                for row in rows:
                    sources.append({
                        "run_id": row["id"],
                        "source_type": source_type,
                        "image_id": str(row["image_id"]),
                        "filename": row["original_name"],
                        "created_at": _iso(row["created_at"]),
                    })
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not retrieve saved analysis runs: {exc}") from exc

    sources.sort(key=lambda item: item["created_at"] or "", reverse=True)
    return {"sources": sources, "count": len(sources)}


@router.get("/runs/{source_type}/{run_id}/explanation")
def explain_saved_run(source_type: str, run_id: str):
    config = SOURCE_TABLES.get(source_type)
    if not config:
        raise HTTPException(status_code=400, detail="Unsupported source type.")

    table = config["table"]
    parameter_column = config["parameter_column"]
    parameter_select = f", r.{parameter_column} AS parameters" if parameter_column else ", NULL AS parameters"
    query = text(f"""
        SELECT r.id, r.image_id, r.results, r.created_at,
               i.original_name{parameter_select}
        FROM {table} r
        JOIN microscopy_images i ON i.id = r.image_id
        WHERE r.id = :run_id
    """)
    try:
        with engine.connect() as connection:
            row = connection.execute(query, {"run_id": run_id}).mappings().first()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not read the selected analysis run: {exc}") from exc

    if not row:
        raise HTTPException(status_code=404, detail="The selected saved analysis run was not found.")
    return _build_explanation(source_type, run_id, row)
