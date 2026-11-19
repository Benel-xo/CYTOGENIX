from __future__ import annotations

import json
import random
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.db.session import engine

router = APIRouter(prefix="/model-laboratory", tags=["Training & Model Laboratory"])
ROOT = Path(__file__).resolve().parents[4]
DATASETS_DIR = ROOT / "data" / "datasets"
CHECKPOINT_DIR = ROOT / "data" / "models" / "checkpoints"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
TRAINING_LOCK = threading.Lock()


def _ensure_table() -> None:
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS model_experiments (
                id VARCHAR(36) PRIMARY KEY,
                dataset_name TEXT NOT NULL,
                status VARCHAR(24) NOT NULL,
                config JSONB NOT NULL DEFAULT '{}'::jsonb,
                results JSONB NOT NULL DEFAULT '{}'::jsonb,
                checkpoint_path TEXT,
                error TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))


def _dataset_info() -> list[dict[str, Any]]:
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    output = []
    for folder in sorted(p for p in DATASETS_DIR.iterdir() if p.is_dir() and not p.is_symlink()):
        classes = []
        total = 0
        for class_dir in sorted(p for p in folder.iterdir() if p.is_dir() and not p.is_symlink()):
            count = sum(1 for f in class_dir.rglob("*") if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS)
            if count:
                classes.append({"name": class_dir.name, "image_count": count})
                total += count
        output.append({"name": folder.name, "classes": classes, "class_count": len(classes), "image_count": total,
                       "ready": len(classes) >= 2 and all(c["image_count"] >= 2 for c in classes)})
    return output


class TrainRequest(BaseModel):
    dataset_name: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    epochs: int = Field(default=5, ge=1, le=50)
    batch_size: int = Field(default=8, ge=1, le=64)
    learning_rate: float = Field(default=0.001, gt=0.000001, le=0.1)
    seed: int = Field(default=42, ge=0, le=1000000)


class SmallCNN(torch.nn.Module):
    def __init__(self, class_count: int):
        super().__init__()
        self.features = torch.nn.Sequential(
            torch.nn.Conv2d(3, 16, 3, padding=1), torch.nn.ReLU(), torch.nn.MaxPool2d(2),
            torch.nn.Conv2d(16, 32, 3, padding=1), torch.nn.ReLU(), torch.nn.MaxPool2d(2),
            torch.nn.Conv2d(32, 64, 3, padding=1), torch.nn.ReLU(), torch.nn.AdaptiveAvgPool2d((1, 1)),
        )
        self.classifier = torch.nn.Sequential(torch.nn.Flatten(), torch.nn.Dropout(0.25), torch.nn.Linear(64, class_count))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.features(x))


def _load_image(path: Path) -> torch.Tensor:
    with Image.open(path) as image:
        image = image.convert("RGB").resize((128, 128))
        array = np.asarray(image, dtype=np.float32) / 255.0
    array = (array - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
    return torch.from_numpy(array.transpose(2, 0, 1).copy())


def _update_experiment(experiment_id: str, status: str, results: dict | None = None,
                       checkpoint_path: str | None = None, error: str | None = None) -> None:
    _ensure_table()
    with engine.begin() as connection:
        connection.execute(text("""
            UPDATE model_experiments SET status=:status,
              results=COALESCE(CAST(:results AS jsonb), results),
              checkpoint_path=COALESCE(:checkpoint_path, checkpoint_path),
              error=:error, updated_at=NOW() WHERE id=:id
        """), {"id": experiment_id, "status": status,
              "results": json.dumps(results) if results is not None else None,
              "checkpoint_path": checkpoint_path, "error": error})


def _run_training(experiment_id: str, request_data: dict[str, Any]) -> None:
    if not TRAINING_LOCK.acquire(blocking=False):
        _update_experiment(experiment_id, "failed", error="Another training job is currently running. Please start this experiment again later.")
        return
    try:
        request = TrainRequest(**request_data)
        dataset_dir = DATASETS_DIR / request.dataset_name
        class_dirs = sorted(p for p in dataset_dir.iterdir() if p.is_dir() and not p.is_symlink())
        class_names = [p.name for p in class_dirs if any(f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS for f in p.rglob("*"))]
        class_names = sorted(class_names)
        class_to_idx = {name: index for index, name in enumerate(class_names)}
        samples: list[tuple[Path, int]] = []
        for name in class_names:
            files = [f for f in (dataset_dir / name).rglob("*") if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS]
            valid = []
            for file in files:
                try:
                    with Image.open(file) as im:
                        im.verify()
                    valid.append(file)
                except (OSError, UnidentifiedImageError):
                    continue
            if len(valid) < 2:
                raise ValueError(f"Class '{name}' needs at least 2 readable images; found {len(valid)}.")
            samples.extend((p, class_to_idx[name]) for p in valid)
        if len(class_names) < 2 or len(samples) < 4:
            raise ValueError("Training requires at least two classes and at least two readable images per class.")

        random.seed(request.seed)
        by_class: dict[int, list[Path]] = {i: [] for i in range(len(class_names))}
        for path, label in samples:
            by_class[label].append(path)
        train_samples: list[tuple[Path, int]] = []
        val_samples: list[tuple[Path, int]] = []
        for label, paths in by_class.items():
            random.shuffle(paths)
            val_count = max(1, int(round(len(paths) * 0.2)))
            val_count = min(val_count, len(paths) - 1)
            val_samples.extend((p, label) for p in paths[:val_count])
            train_samples.extend((p, label) for p in paths[val_count:])
        random.shuffle(train_samples)

        device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
        torch.manual_seed(request.seed)
        if device.type == "mps":
            try:
                torch.mps.manual_seed(request.seed)
            except Exception:
                pass
        model = SmallCNN(len(class_names)).to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=request.learning_rate)
        criterion = torch.nn.CrossEntropyLoss()
        history = []

        for epoch in range(request.epochs):
            model.train()
            random.shuffle(train_samples)
            train_loss_sum = 0.0
            train_correct = 0
            train_seen = 0
            for start in range(0, len(train_samples), request.batch_size):
                batch = train_samples[start:start + request.batch_size]
                images = torch.stack([_load_image(p) for p, _ in batch]).to(device)
                labels = torch.tensor([label for _, label in batch], dtype=torch.long, device=device)
                optimizer.zero_grad(set_to_none=True)
                logits = model(images)
                loss = criterion(logits, labels)
                loss.backward()
                optimizer.step()
                train_loss_sum += float(loss.detach().cpu()) * len(batch)
                train_correct += int((logits.argmax(1) == labels).sum().detach().cpu())
                train_seen += len(batch)

            model.eval()
            val_loss_sum = 0.0
            val_correct = 0
            val_seen = 0
            with torch.no_grad():
                for start in range(0, len(val_samples), request.batch_size):
                    batch = val_samples[start:start + request.batch_size]
                    images = torch.stack([_load_image(p) for p, _ in batch]).to(device)
                    labels = torch.tensor([label for _, label in batch], dtype=torch.long, device=device)
                    logits = model(images)
                    loss = criterion(logits, labels)
                    val_loss_sum += float(loss.detach().cpu()) * len(batch)
                    val_correct += int((logits.argmax(1) == labels).sum().detach().cpu())
                    val_seen += len(batch)
            epoch_result = {
                "epoch": epoch + 1,
                "train_loss": round(train_loss_sum / max(train_seen, 1), 6),
                "train_accuracy": round(train_correct / max(train_seen, 1), 6),
                "validation_loss": round(val_loss_sum / max(val_seen, 1), 6),
                "validation_accuracy": round(val_correct / max(val_seen, 1), 6),
            }
            history.append(epoch_result)
            _update_experiment(experiment_id, "running", results={"history": history, "completed_epochs": epoch + 1,
                "total_epochs": request.epochs, "device": str(device), "class_names": class_names,
                "train_images": len(train_samples), "validation_images": len(val_samples)})

        CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
        checkpoint = CHECKPOINT_DIR / f"{experiment_id}.pt"
        torch.save({"model_state_dict": model.cpu().state_dict(), "class_names": class_names,
                    "input_size": [128, 128], "architecture": "CYTOGENIX-SmallCNN-v1",
                    "experiment_id": experiment_id, "seed": request.seed}, checkpoint)
        final = history[-1]
        results = {"history": history, "completed_epochs": request.epochs, "total_epochs": request.epochs,
                   "device": str(device), "class_names": class_names, "train_images": len(train_samples),
                   "validation_images": len(val_samples), "final_train_loss": final["train_loss"],
                   "final_train_accuracy": final["train_accuracy"], "final_validation_loss": final["validation_loss"],
                   "final_validation_accuracy": final["validation_accuracy"],
                   "metrics_note": "Metrics are measured on this experiment's image-level random split. They are not clinical performance estimates and may be optimistic if images from the same patient or specimen occur in both splits."}
        _update_experiment(experiment_id, "completed", results=results, checkpoint_path=str(checkpoint.relative_to(ROOT)))
    except Exception as exc:
        _update_experiment(experiment_id, "failed", error=str(exc)[:2000])
    finally:
        TRAINING_LOCK.release()


@router.get("/health")
def model_lab_health():
    _ensure_table()
    return {"status": "ready", "torch_version": torch.__version__,
            "mps_available": bool(torch.backends.mps.is_available()),
            "device_available": "mps" if torch.backends.mps.is_available() else "cpu",
            "dataset_directory": str(DATASETS_DIR.relative_to(ROOT))}


@router.get("/datasets")
def list_datasets():
    return {"datasets": _dataset_info(), "dataset_root": str(DATASETS_DIR.relative_to(ROOT)),
            "expected_layout": "data/datasets/<dataset_name>/<class_name>/<image files>"}


@router.post("/train", status_code=202)
def start_training(request: TrainRequest, background_tasks: BackgroundTasks):
    _ensure_table()
    info = next((d for d in _dataset_info() if d["name"] == request.dataset_name), None)
    if not info:
        raise HTTPException(status_code=404, detail="Dataset not found. Add it under data/datasets/<dataset_name>/<class_name>/.")
    if not info["ready"]:
        raise HTTPException(status_code=400, detail="Dataset needs at least two classes with at least two images in every class.")
    experiment_id = str(uuid.uuid4())
    config = request.model_dump()
    with engine.begin() as connection:
        connection.execute(text("""INSERT INTO model_experiments (id,dataset_name,status,config,results)
            VALUES (:id,:dataset,:status,CAST(:config AS jsonb),'{}'::jsonb)"""),
            {"id": experiment_id, "dataset": request.dataset_name, "status": "queued", "config": json.dumps(config)})
    background_tasks.add_task(_run_training, experiment_id, config)
    return {"experiment_id": experiment_id, "status": "queued", "message": "Training job queued. Refresh experiment status to follow actual progress."}


@router.get("/experiments")
def list_experiments():
    _ensure_table()
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT id,dataset_name,status,config,results,error,created_at,updated_at FROM model_experiments ORDER BY created_at DESC LIMIT 100")).mappings().all()
    return {"experiments": [dict(row) for row in rows]}


@router.get("/experiments/{experiment_id}")
def get_experiment(experiment_id: str):
    _ensure_table()
    with engine.connect() as connection:
        row = connection.execute(text("SELECT id,dataset_name,status,config,results,checkpoint_path,error,created_at,updated_at FROM model_experiments WHERE id=:id"), {"id": experiment_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Experiment not found.")
    return dict(row)


# CYTOGENIX: Ten-cancer programme manager
TEN_CANCER_PROGRAMS = [
    {"id": "breast", "name": "Breast Cancer", "aliases": ["breast", "breastcancer", "breakhis", "bach"]},
    {"id": "lung", "name": "Lung Cancer", "aliases": ["lung", "lungcancer", "lc2500lung"]},
    {"id": "colorectal", "name": "Colorectal Cancer", "aliases": ["colorectal", "colon", "crc", "nctcrche100k", "lc2500colon"]},
    {"id": "prostate", "name": "Prostate Cancer", "aliases": ["prostate", "prostatecancer", "prad"]},
    {"id": "stomach", "name": "Stomach Cancer", "aliases": ["stomach", "gastric", "stomachcancer", "stad"]},
    {"id": "cervical", "name": "Cervical Cancer", "aliases": ["cervical", "cervix", "cervicalcancer"]},
    {"id": "bladder", "name": "Bladder Cancer", "aliases": ["bladder", "bladdercancer", "blca"]},
    {"id": "melanoma", "name": "Melanoma", "aliases": ["melanoma", "skin", "skincancer"]},
    {"id": "kidney", "name": "Kidney Cancer", "aliases": ["kidney", "renal", "kidneycancer", "kirc", "kirp"]},
    {"id": "liver", "name": "Liver Cancer", "aliases": ["liver", "hepatic", "livercancer", "lihc"]},
]


def _normalise_program_name(value: str) -> str:
    return "".join(ch.lower() for ch in value if ch.isalnum())


def _get_cancer_programs() -> list[dict[str, Any]]:
    datasets = _dataset_info()
    output = []

    for program in TEN_CANCER_PROGRAMS:
        aliases = [_normalise_program_name(x) for x in program["aliases"]]
        aliases.append(program["id"])

        matched = None
        for dataset in datasets:
            candidate = _normalise_program_name(dataset["name"])
            if candidate in aliases or any(
                len(alias) >= 4 and alias in candidate for alias in aliases
            ):
                matched = dataset
                break

        output.append({
            "id": program["id"],
            "name": program["name"],
            "dataset_name": matched["name"] if matched else None,
            "image_count": matched["image_count"] if matched else 0,
            "class_count": matched["class_count"] if matched else 0,
            "ready": bool(matched and matched["ready"]),
            "status": (
                "Ready to train" if matched and matched["ready"]
                else "Needs more labelled images" if matched
                else "Dataset not installed"
            ),
        })

    return output


class BatchTrainRequest(BaseModel):
    epochs: int = Field(default=3, ge=1, le=50)
    batch_size: int = Field(default=8, ge=1, le=64)
    learning_rate: float = Field(default=0.001, gt=0.000001, le=0.1)
    seed: int = Field(default=42, ge=0, le=1000000)


def _run_training_batch(jobs: list[dict[str, Any]]) -> None:
    # Sequential execution deliberately protects unified memory on Apple Silicon.
    for job in jobs:
        _run_training(job["id"], job["config"])


@router.get("/programs")
def list_cancer_programs():
    programs = _get_cancer_programs()
    return {
        "programs": programs,
        "total_programs": len(programs),
        "ready_count": sum(1 for p in programs if p["ready"]),
        "message": "Only datasets with sufficient labelled images are marked ready.",
    }


@router.post("/train-ready", status_code=202)
def train_all_ready_programs(
    request: BatchTrainRequest,
    background_tasks: BackgroundTasks,
):
    _ensure_table()
    programs = [p for p in _get_cancer_programs() if p["ready"]]

    if not programs:
        raise HTTPException(
            status_code=400,
            detail="No cancer datasets are ready yet. Add verified labelled images under data/datasets/ first.",
        )

    jobs = []
    for program in programs:
        experiment_id = str(uuid.uuid4())
        config = TrainRequest(
            dataset_name=program["dataset_name"],
            epochs=request.epochs,
            batch_size=request.batch_size,
            learning_rate=request.learning_rate,
            seed=request.seed,
        ).model_dump()

        with engine.begin() as connection:
            connection.execute(text("""
                INSERT INTO model_experiments
                    (id, dataset_name, status, config, results)
                VALUES
                    (:id, :dataset, 'queued', CAST(:config AS jsonb), '{}'::jsonb)
            """), {
                "id": experiment_id,
                "dataset": program["dataset_name"],
                "config": json.dumps(config),
            })

        jobs.append({"id": experiment_id, "config": config})

    background_tasks.add_task(_run_training_batch, jobs)

    return {
        "status": "queued",
        "queued_count": len(jobs),
        "experiments": [
            {"experiment_id": job["id"], "dataset": job["config"]["dataset_name"]}
            for job in jobs
        ],
        "message": "Ready cancer datasets queued for sequential training.",
    }
