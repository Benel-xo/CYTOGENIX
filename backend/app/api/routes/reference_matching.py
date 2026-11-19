from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlalchemy import text

from app.db.session import engine
from app.api.routes.reference_slides import STORAGE, CANCERS

router = APIRouter(
    prefix="/reference-matching",
    tags=["Cancer Reference Image Matching"]
)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}


def image_features(source):
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((512, 512))
        array = np.asarray(image, dtype=np.uint8)

    features = []
    for channel in range(3):
        histogram, _ = np.histogram(
            array[:, :, channel], bins=32, range=(0, 256)
        )
        histogram = histogram.astype(np.float64)
        total = histogram.sum()
        features.append(histogram / total if total else histogram)

    gray = np.asarray(
        Image.fromarray(array).convert("L"), dtype=np.uint8
    )
    histogram, _ = np.histogram(gray, bins=64, range=(0, 256))
    histogram = histogram.astype(np.float64)
    total = histogram.sum()
    features.append(histogram / total if total else histogram)

    return features


def histogram_similarity(first, second):
    scores = []
    for a, b in zip(first, second):
        scores.append(float(np.minimum(a, b).sum()))
    return max(0.0, min(1.0, sum(scores) / len(scores)))


@router.get("/health")
def health():
    return {
        "status": "online",
        "method": "RGB and grayscale histogram intersection",
        "training_required": False
    }


@router.post("/compare")
async def compare_reference_images(file: UploadFile = File(...)):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Upload a PNG, JPG, JPEG, TIFF or BMP image."
        )

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()

    if not content:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Maximum comparison upload size is 20 MB.")

    try:
        query_features = image_features(io.BytesIO(content))
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=422, detail="The uploaded file is not a readable image.")

    with engine.connect() as connection:
        rows = connection.execute(text("""
            SELECT id, cancer_id, slot, original_name, stored_name,
                   width, height, tissue_type, stain, license, source_url
            FROM reference_slides
            ORDER BY cancer_id, slot
        """)).mappings().all()

    matches = []
    skipped = []

    for row in rows:
        cancer_id = row["cancer_id"]
        if cancer_id not in CANCERS:
            continue

        path = STORAGE / cancer_id / row["stored_name"]
        if not path.is_file():
            skipped.append(row["id"])
            continue

        try:
            reference_features = image_features(path)
            similarity = histogram_similarity(query_features, reference_features)
        except (UnidentifiedImageError, OSError, ValueError):
            skipped.append(row["id"])
            continue

        matches.append({
            "slide_id": row["id"],
            "cancer_id": cancer_id,
            "cancer_name": CANCERS[cancer_id],
            "slot": row["slot"],
            "filename": row["original_name"],
            "width": row["width"],
            "height": row["height"],
            "tissue_type": row["tissue_type"],
            "stain": row["stain"],
            "license": row["license"],
            "source_url": row["source_url"],
            "similarity_score": round(similarity * 100, 2),
            "image_url": f"/api/v1/reference-slides/slides/{row['id']}/file"
        })

    matches.sort(key=lambda item: item["similarity_score"], reverse=True)

    return {
        "uploaded_filename": Path(file.filename or "uploaded-image").name,
        "method": "RGB channel and grayscale histogram intersection",
        "references_examined": len(matches),
        "references_skipped": len(skipped),
        "closest_match": matches[0] if matches else None,
        "matches": matches[:5],
        "interpretation": (
            "The score measures similarity between image colour and grayscale "
            "intensity distributions. It is not a cancer probability, diagnostic "
            "confidence, tissue classifier, or validated pathology metric. "
            "Differences in stain, magnification, lighting and image capture can "
            "strongly affect the score."
        ),
        "research_notice": (
            "Experimental visual reference matching only. The closest reference "
            "category does not establish the cancer type or diagnosis of the "
            "uploaded specimen."
        )
    }
