from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import torch
from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlalchemy import text

from app.db.session import engine
from app.api.routes.model_laboratory import (
    ROOT, CHECKPOINT_DIR, SmallCNN, _ensure_table
)

router = APIRouter(
    prefix="/cancer-classification",
    tags=["Cancer AI Classification"]
)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


@router.get("/models")
def available_models():
    _ensure_table()
    with engine.connect() as connection:
        rows = connection.execute(text("""
            SELECT id, dataset_name, results, checkpoint_path, updated_at
            FROM model_experiments
            WHERE status = 'completed' AND checkpoint_path IS NOT NULL
            ORDER BY updated_at DESC
        """)).mappings().all()

    models = []
    for row in rows:
        path = (ROOT / row["checkpoint_path"]).resolve()
        if not path.is_relative_to(CHECKPOINT_DIR.resolve()) or not path.is_file():
            continue
        models.append({
            "experiment_id": row["id"],
            "dataset_name": row["dataset_name"],
            "class_names": (row["results"] or {}).get("class_names", []),
            "validation_accuracy": (row["results"] or {}).get("final_validation_accuracy"),
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        })

    return {
        "models": models,
        "count": len(models),
        "message": "Only completed experiments with available checkpoints are listed."
    }


@router.post("/predict/{experiment_id}")
async def predict(experiment_id: str, file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Upload a PNG, JPG, TIFF or BMP image.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(400, "The uploaded image is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Image exceeds the 20 MB upload limit.")

    _ensure_table()
    with engine.connect() as connection:
        row = connection.execute(text("""
            SELECT dataset_name, status, checkpoint_path
            FROM model_experiments WHERE id = :id
        """), {"id": experiment_id}).mappings().first()

    if not row or row["status"] != "completed" or not row["checkpoint_path"]:
        raise HTTPException(404, "No completed model checkpoint exists for this experiment.")

    checkpoint_path = (ROOT / row["checkpoint_path"]).resolve()
    if not checkpoint_path.is_relative_to(CHECKPOINT_DIR.resolve()) or not checkpoint_path.is_file():
        raise HTTPException(404, "The trained model checkpoint is unavailable.")

    try:
        checkpoint = torch.load(
            checkpoint_path, map_location="cpu", weights_only=True
        )
        class_names = checkpoint["class_names"]
        if not class_names:
            raise ValueError("Checkpoint has no class names.")

        with Image.open(io.BytesIO(content)) as image:
            image = image.convert("RGB").resize((128, 128))
            array = np.asarray(image, dtype=np.float32) / 255.0

        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        array = (array - mean) / std
        tensor = torch.from_numpy(array.transpose(2, 0, 1).copy()).unsqueeze(0)

        model = SmallCNN(len(class_names))
        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()

        with torch.inference_mode():
            probabilities = torch.softmax(model(tensor), dim=1)[0].tolist()

        scores = [
            {"class_name": name, "softmax_score": round(float(score) * 100, 3)}
            for name, score in zip(class_names, probabilities)
        ]
        scores.sort(key=lambda item: item["softmax_score"], reverse=True)

        return {
            "experiment_id": experiment_id,
            "dataset_name": row["dataset_name"],
            "filename": file.filename,
            "architecture": checkpoint.get("architecture", "CYTOGENIX-SmallCNN-v1"),
            "input_size": "128 x 128 RGB",
            "predicted_class": scores[0]["class_name"],
            "scores": scores,
            "interpretation": (
                "Softmax outputs are uncalibrated model scores, not validated "
                "probabilities, diagnostic confidence, or evidence of disease."
            ),
            "research_notice": (
                "Experimental image-level research only. Not validated for "
                "clinical diagnosis, screening, or patient management."
            ),
        }

    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "The uploaded file could not be read as an image.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Prediction failed: {str(exc)[:300]}")
    finally:
        await file.close()
