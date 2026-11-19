from __future__ import annotations

import json
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter(
    prefix="/dataset-laboratory",
    tags=["Dataset Laboratory"],
)

ROOT = Path(__file__).resolve().parents[4]
LOCAL_REGISTRY = ROOT / "data" / "cloud_registry" / "colorectal_crc.json"

CLOUD_REGISTRY_URL = (
    "https://huggingface.co/datasets/Ben0205/"
    "cytogenix-research-data/resolve/main/"
    "cloud_registry/colorectal_crc.json"
)

IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"
}


def _load_registry() -> tuple[dict[str, Any], str, str | None]:
    request = urllib.request.Request(
        CLOUD_REGISTRY_URL,
        headers={"User-Agent": "CYTOGENIX-Dataset-Laboratory/1.0"},
    )

    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            registry = json.loads(response.read().decode("utf-8"))
        return registry, "huggingface", None
    except Exception as cloud_error:
        if LOCAL_REGISTRY.exists():
            try:
                registry = json.loads(
                    LOCAL_REGISTRY.read_text(encoding="utf-8")
                )
                return (
                    registry,
                    "local_fallback",
                    f"Cloud registry could not be reached: {type(cloud_error).__name__}",
                )
            except Exception as local_error:
                raise HTTPException(
                    status_code=500,
                    detail=f"Both cloud and local registry failed: {local_error}",
                )

        raise HTTPException(
            status_code=503,
            detail="Cloud registry unavailable and local registry not found.",
        )


def _scan_dataset(folder: Path) -> dict[str, Any]:
    classes = []
    total_images = 0

    if not folder.exists() or not folder.is_dir():
        return {
            "directory": str(folder.relative_to(ROOT)),
            "folder_exists": False,
            "image_count": 0,
            "class_count": 0,
            "classes": [],
            "available": False,
            "ready_for_basic_training": False,
        }

    for class_dir in sorted(folder.iterdir()):
        if not class_dir.is_dir() or class_dir.is_symlink():
            continue

        count = 0
        for file in class_dir.rglob("*"):
            if (
                file.is_file()
                and not file.is_symlink()
                and file.suffix.lower() in IMAGE_EXTENSIONS
            ):
                count += 1

        if count:
            classes.append({
                "name": class_dir.name,
                "image_count": count,
            })
            total_images += count

    ready = (
        len(classes) >= 2
        and all(item["image_count"] >= 2 for item in classes)
    )

    return {
        "directory": str(folder.relative_to(ROOT)),
        "folder_exists": True,
        "image_count": total_images,
        "class_count": len(classes),
        "classes": classes,
        "available": total_images > 0,
        "ready_for_basic_training": ready,
    }


@router.get("/overview")
def get_dataset_laboratory_overview():
    registry, registry_source, warning = _load_registry()

    training_folder = ROOT / "data" / "datasets" / "NCT-CRC-HE-100K"
    validation_folder = ROOT / "data" / "validation" / "CRC-VAL-HE-7K"

    training = _scan_dataset(training_folder)
    validation = _scan_dataset(validation_folder)

    return {
        "platform": "CYTOGENIX",
        "registry": registry,
        "registry_connection": {
            "source": registry_source,
            "cloud_repository": (
                "https://huggingface.co/datasets/"
                "Ben0205/cytogenix-research-data"
            ),
            "cloud_registry_url": CLOUD_REGISTRY_URL,
            "warning": warning,
        },
        "local_datasets": {
            "training": training,
            "validation": validation,
        },
        "research_integrity": {
            "validation_separate_from_training": True,
            "validation_used_for_training": False,
            "clinical_validation_claimed": False,
        },
    }
