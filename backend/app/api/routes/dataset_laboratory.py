from __future__ import annotations

import hashlib
import json
import os
import shutil
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from PIL import Image, UnidentifiedImageError

from app.db.session import engine

router = APIRouter(prefix="/dataset-laboratory", tags=["Dataset Laboratory"])

ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = ROOT / "data"
DATASETS_DIR = DATA_DIR / "datasets"
VALIDATION_DIR = DATA_DIR / "validation"
DOWNLOADS_DIR = DATA_DIR / "downloads"
LOCAL_REGISTRY = DATA_DIR / "cloud_registry" / "colorectal_crc.json"

HF_REPOSITORY = "https://huggingface.co/datasets/Ben0205/cytogenix-research-data"
HF_MANIFEST = HF_REPOSITORY + "/resolve/main/cloud_registry/colorectal_crc.json"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
MAX_SCAN_FILES = 100000
MAX_VERIFY_IMAGES = 500

PROGRAMS = [
    ("breast", "Breast Cancer"),
    ("lung", "Lung Cancer"),
    ("colorectal", "Colorectal Cancer"),
    ("prostate", "Prostate Cancer"),
    ("stomach", "Stomach Cancer"),
    ("cervical", "Cervical Cancer"),
    ("bladder", "Bladder Cancer"),
    ("melanoma", "Melanoma"),
    ("kidney", "Kidney Cancer"),
    ("liver", "Liver Cancer"),
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ensure_tables():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS research_datasets (
                dataset_id TEXT PRIMARY KEY,
                program_id TEXT NOT NULL,
                title TEXT NOT NULL,
                source_url TEXT,
                source_type TEXT,
                license TEXT,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS dataset_versions (
                version_id TEXT PRIMARY KEY,
                dataset_id TEXT NOT NULL REFERENCES research_datasets(dataset_id),
                version_label TEXT NOT NULL,
                storage_type TEXT NOT NULL,
                location TEXT,
                checksum TEXT,
                verification_status TEXT NOT NULL DEFAULT 'not_verified',
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS dataset_audit_events (
                event_id TEXT PRIMARY KEY,
                dataset_id TEXT,
                event_type TEXT NOT NULL,
                details JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))

        # Register the one dataset for which source metadata is verified.
        conn.execute(text("""
            INSERT INTO research_datasets
                (dataset_id, program_id, title, source_url, source_type, license, metadata)
            VALUES
                ('colorectal_crc', 'colorectal', 'NCT-CRC-HE-100K and CRC-VAL-HE-7K',
                 'https://zenodo.org/records/1214456', 'Zenodo', 'CC BY 4.0',
                 CAST(:metadata AS jsonb))
            ON CONFLICT (dataset_id) DO NOTHING
        """), {"metadata": json.dumps({
            "doi": "10.5281/zenodo.1214456",
            "training_archive": "NCT-CRC-HE-100K.zip",
            "training_size": "11.7 GB",
            "training_md5": "6fd702d11df6292bc054397ae038a464",
            "validation_archive": "CRC-VAL-HE-7K.zip",
            "validation_size": "800.3 MB",
            "validation_image_count": 7180,
            "validation_md5": "2fd1651b4f94ebd818ebf90ad2b6ce06",
            "classes": ["ADI", "BACK", "DEB", "LYM", "MUC", "MUS", "NORM", "STR", "TUM"],
            "validation_must_remain_separate": True,
            "metadata_only_cloud_copy": True
        })})


def _audit(event_type: str, details: dict[str, Any], dataset_id: str | None = None):
    _ensure_tables()
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO dataset_audit_events (event_id, dataset_id, event_type, details)
            VALUES (:id, :dataset_id, :event_type, CAST(:details AS jsonb))
        """), {
            "id": str(uuid.uuid4()),
            "dataset_id": dataset_id,
            "event_type": event_type,
            "details": json.dumps(details, default=str)
        })


def _safe_scan(folder: Path) -> dict[str, Any]:
    folder_exists = folder.exists() and folder.is_dir()
    classes = []
    total = 0
    scanned_files = 0
    truncated = False

    if folder_exists:
        for class_dir in sorted(folder.iterdir()):
            if not class_dir.is_dir() or class_dir.is_symlink():
                continue

            count = 0
            for current, dirs, filenames in os.walk(class_dir, followlinks=False):
                dirs[:] = [d for d in dirs if not (Path(current) / d).is_symlink()]
                for filename in filenames:
                    path = Path(current) / filename
                    if path.is_symlink():
                        continue
                    scanned_files += 1
                    if path.suffix.lower() in IMAGE_EXTENSIONS:
                        count += 1
                    if scanned_files >= MAX_SCAN_FILES:
                        truncated = True
                        break
                if truncated:
                    break

            if count:
                classes.append({"name": class_dir.name, "image_count": count})
                total += count
            if truncated:
                break

    return {
        "directory": str(folder.relative_to(ROOT)),
        "folder_exists": folder_exists,
        "image_count": total,
        "class_count": len(classes),
        "classes": classes,
        "available": total > 0,
        "ready_for_basic_training": (
            len(classes) >= 2 and all(c["image_count"] >= 2 for c in classes)
        ),
        "scan_truncated": truncated,
        "scan_limit": MAX_SCAN_FILES
    }


def _load_cloud_registry():
    try:
        request = urllib.request.Request(
            HF_MANIFEST,
            headers={"User-Agent": "CYTOGENIX-Dataset-Laboratory/1.0"}
        )
        with urllib.request.urlopen(request, timeout=6) as response:
            data = json.loads(response.read().decode("utf-8"))
        return {
            "connected": True,
            "source": "huggingface",
            "repository": HF_REPOSITORY,
            "manifest_url": HF_MANIFEST,
            "warning": None,
            "manifest": data
        }
    except Exception as exc:
        local = None
        try:
            local = json.loads(LOCAL_REGISTRY.read_text())
        except Exception:
            pass
        return {
            "connected": False,
            "source": "local_fallback" if local else "unavailable",
            "repository": HF_REPOSITORY,
            "manifest_url": HF_MANIFEST,
            "warning": str(exc)[:300],
            "manifest": local
        }


def _storage_overview():
    usage = shutil.disk_usage(ROOT)
    downloads = []
    if DOWNLOADS_DIR.exists():
        for item in DOWNLOADS_DIR.iterdir():
            if item.is_file() and not item.is_symlink():
                downloads.append({
                    "name": item.name,
                    "size_bytes": item.stat().st_size
                })
    return {
        "local": {
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
            "used_percent": round((usage.used / usage.total) * 100, 2) if usage.total else 0,
            "root": str(ROOT)
        },
        "download_files": downloads,
        "cloud": {
            "provider": "Hugging Face",
            "repository": HF_REPOSITORY,
            "purpose": "Public metadata registry",
            "dataset_archives_uploaded": False,
            "quota_or_free_storage_guaranteed": False
        }
    }


def _registered_datasets():
    _ensure_tables()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT dataset_id, program_id, title, source_url, source_type,
                   license, metadata, created_at, updated_at
            FROM research_datasets ORDER BY program_id, title
        """)).mappings().all()
    return [dict(row) for row in rows]


class VerifyRequest(BaseModel):
    dataset_name: str = Field(min_length=1, max_length=100)


class PrepareRequest(BaseModel):
    training_dataset: str = Field(min_length=1, max_length=100)
    validation_dataset: str | None = Field(default=None, max_length=100)


@router.get("/health")
def dataset_lab_health():
    _ensure_tables()
    return {"status": "ready", "database": "connected", "platform": "CYTOGENIX"}


@router.get("/overview")
def overview():
    _ensure_tables()
    training = _safe_scan(DATASETS_DIR / "NCT-CRC-HE-100K")
    validation = _safe_scan(VALIDATION_DIR / "CRC-VAL-HE-7K")
    programs = []

    for program_id, name in PROGRAMS:
        local_matches = []
        for folder in sorted(DATASETS_DIR.iterdir()) if DATASETS_DIR.exists() else []:
            if folder.is_dir() and program_id in folder.name.lower():
                local_matches.append(_safe_scan(folder))
        programs.append({
            "id": program_id,
            "name": name,
            "registered_source": program_id == "colorectal",
            "dataset_installed": any(x["available"] for x in local_matches),
            "local_image_count": sum(x["image_count"] for x in local_matches),
            "status": (
                "Verified source registered; local images not installed"
                if program_id == "colorectal" and not any(x["available"] for x in local_matches)
                else "Local dataset detected" if any(x["available"] for x in local_matches)
                else "Dataset source not yet verified"
            )
        })

    return {
        "platform": "CYTOGENIX",
        "registry": _registered_datasets(),
        "programmes": programs,
        "registry_connection": _load_cloud_registry(),
        "storage": _storage_overview(),
        "local_datasets": {
            "training": training,
            "validation": validation
        },
        "research_integrity": {
            "validation_separate_from_training": True,
            "validation_used_for_training": False,
            "clinical_validation_claimed": False,
            "training_readiness_is_not_scientific_validation": True
        },
        "limits": {
            "image_scan_limit": MAX_SCAN_FILES,
            "image_verification_limit": MAX_VERIFY_IMAGES,
            "automatic_downloads": False
        }
    }


@router.get("/audit")
def audit_history(limit: int = 50):
    _ensure_tables()
    limit = max(1, min(limit, 200))
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT event_id, dataset_id, event_type, details, created_at
            FROM dataset_audit_events ORDER BY created_at DESC LIMIT :limit
        """), {"limit": limit}).mappings().all()
    return {"events": [dict(row) for row in rows]}


@router.get("/versions")
def list_versions():
    _ensure_tables()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT version_id, dataset_id, version_label, storage_type,
                   location, checksum, verification_status, metadata, created_at
            FROM dataset_versions ORDER BY created_at DESC
        """)).mappings().all()
    return {"versions": [dict(row) for row in rows]}


@router.post("/scan")
def scan_local_datasets():
    training = _safe_scan(DATASETS_DIR / "NCT-CRC-HE-100K")
    validation = _safe_scan(VALIDATION_DIR / "CRC-VAL-HE-7K")
    _audit("local_dataset_scan", {
        "training_images": training["image_count"],
        "validation_images": validation["image_count"]
    }, "colorectal_crc")
    return {"training": training, "validation": validation, "scanned_at": _now()}


@router.post("/verify")
def verify_dataset(request: VerifyRequest):
    if not request.dataset_name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid dataset folder name.")
    folder = (DATASETS_DIR / request.dataset_name).resolve()
    if folder.parent != DATASETS_DIR.resolve() or not folder.is_dir():
        raise HTTPException(status_code=404, detail="Training dataset folder not found.")

    checked = 0
    valid = 0
    invalid = []
    for current, dirs, filenames in os.walk(folder, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(current) / d).is_symlink()]
        for filename in filenames:
            path = Path(current) / filename
            if path.is_symlink() or path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            checked += 1
            try:
                with Image.open(path) as image:
                    image.verify()
                valid += 1
            except (OSError, UnidentifiedImageError, ValueError):
                invalid.append(str(path.relative_to(ROOT)))
            if checked >= MAX_VERIFY_IMAGES:
                break
        if checked >= MAX_VERIFY_IMAGES:
            break

    result = {
        "dataset_name": request.dataset_name,
        "checked_images": checked,
        "readable_images": valid,
        "unreadable_images_in_sample": len(invalid),
        "invalid_sample": invalid[:30],
        "sample_limit_reached": checked >= MAX_VERIFY_IMAGES,
        "note": "This is a bounded sample check, not a complete archive integrity verification."
    }
    _audit("sample_image_verification", result, "colorectal_crc")
    return result


@router.post("/prepare-training")
def prepare_training(request: PrepareRequest):
    name = request.training_dataset
    if not name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid training dataset name.")
    folder = (DATASETS_DIR / name).resolve()
    if folder.parent != DATASETS_DIR.resolve() or not folder.is_dir():
        raise HTTPException(status_code=404, detail="Training folder not found.")

    scan = _safe_scan(folder)
    if not scan["ready_for_basic_training"]:
        raise HTTPException(
            status_code=400,
            detail="Training preparation blocked: need at least two classes with at least two images in each class."
        )

    validation_result = None
    if request.validation_dataset:
        val_name = request.validation_dataset
        if not val_name.replace("-", "").replace("_", "").isalnum():
            raise HTTPException(status_code=400, detail="Invalid validation dataset name.")
        val_folder = (VALIDATION_DIR / val_name).resolve()
        if val_folder.parent != VALIDATION_DIR.resolve() or not val_folder.is_dir():
            raise HTTPException(status_code=404, detail="Independent validation folder not found.")
        validation_result = _safe_scan(val_folder)
        if not validation_result["available"]:
            raise HTTPException(status_code=400, detail="Validation folder contains no images.")

    result = {
        "status": "prepared_for_module_11",
        "training_dataset": name,
        "training_image_count": scan["image_count"],
        "training_classes": scan["classes"],
        "independent_validation": validation_result,
        "validation_is_used_by_current_module_11_training": False,
        "note": "Preparation records dataset readiness only. Current Module 11 training uses its own image-level random split; it does not yet consume this independent validation folder."
    }
    _audit("training_preparation_check", result, "colorectal_crc")
    return result


@router.post("/acquisition-plan")
def acquisition_plan():
    result = {
        "status": "approval_required",
        "automatic_download_started": False,
        "training_archive": {
            "name": "NCT-CRC-HE-100K.zip",
            "url": "https://zenodo.org/records/1214456/files/NCT-CRC-HE-100K.zip?download=1",
            "approximate_size": "11.7 GB",
            "md5": "6fd702d11df6292bc054397ae038a464"
        },
        "validation_archive": {
            "name": "CRC-VAL-HE-7K.zip",
            "url": "https://zenodo.org/records/1214456/files/CRC-VAL-HE-7K.zip?download=1",
            "approximate_size": "800.3 MB",
            "md5": "2fd1651b4f94ebd818ebf90ad2b6ce06"
        },
        "local_free_bytes": shutil.disk_usage(ROOT).free,
        "estimated_total_download": "approximately 12.5 GB",
        "warning": "No download has been started. Check available disk space and obtain explicit user approval before acquisition."
    }
    _audit("acquisition_plan_viewed", result, "colorectal_crc")
    return result
