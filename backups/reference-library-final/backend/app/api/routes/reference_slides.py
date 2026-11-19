from pathlib import Path
from uuid import uuid4
import os
import mimetypes

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import text
from PIL import Image, UnidentifiedImageError

from app.db.session import engine

router = APIRouter(prefix="/reference-slides", tags=["Reference Slide Library"])

ROOT = Path(__file__).resolve().parents[4]
STORAGE = ROOT / "data" / "reference_slides"
STORAGE.mkdir(parents=True, exist_ok=True)

CANCERS = {
    "breast": "Breast Cancer",
    "lung": "Lung Cancer",
    "colorectal": "Colorectal Cancer",
    "prostate": "Prostate Cancer",
    "stomach": "Stomach Cancer",
    "cervical": "Cervical Cancer",
    "bladder": "Bladder Cancer",
    "melanoma": "Melanoma",
    "kidney": "Kidney Cancer",
    "liver": "Liver Cancer",
}
EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}
MAX_SIZE = 100 * 1024 * 1024


def initialise_table():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS reference_slides (
                id VARCHAR(36) PRIMARY KEY,
                cancer_id VARCHAR(40) NOT NULL,
                slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                mime_type TEXT,
                size_bytes BIGINT NOT NULL,
                width BIGINT,
                height BIGINT,
                tissue_type TEXT,
                stain TEXT,
                source_url TEXT,
                license TEXT,
                notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(cancer_id, slot)
            )
        """))


initialise_table()


def slide_dict(row):
    item = dict(row)
    item["cancer_name"] = CANCERS.get(item["cancer_id"], item["cancer_id"])
    item["file_url"] = f"/api/v1/reference-slides/{item['id']}/file"
    return item


@router.get("/health")
def health():
    return {"status": "online", "module": "Reference Slide Library"}


@router.get("/catalogue")
def catalogue():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT cancer_id, slot FROM reference_slides
        """)).mappings().all()

    occupied = {(r["cancer_id"], r["slot"]) for r in rows}
    result = []
    for cancer_id, name in CANCERS.items():
        slots = []
        for slot in (1, 2):
            slots.append({
                "slot": slot,
                "occupied": (cancer_id, slot) in occupied
            })
        result.append({
            "id": cancer_id,
            "name": name,
            "slides_count": sum(s["occupied"] for s in slots),
            "slots": slots
        })
    return {"cancers": result, "total_capacity": 20,
            "total_uploaded": len(occupied)}


@router.get("/slides")
def list_slides(cancer_id: str | None = None):
    if cancer_id and cancer_id not in CANCERS:
        raise HTTPException(status_code=404, detail="Unknown cancer category.")
    with engine.connect() as conn:
        if cancer_id:
            rows = conn.execute(text("""
                SELECT * FROM reference_slides
                WHERE cancer_id=:cancer_id ORDER BY slot
            """), {"cancer_id": cancer_id}).mappings().all()
        else:
            rows = conn.execute(text("""
                SELECT * FROM reference_slides
                ORDER BY cancer_id, slot
            """)).mappings().all()
    return {"slides": [slide_dict(r) for r in rows]}


@router.post("/slides")
async def upload_slide(
    cancer_id: str = Form(...),
    slot: int = Form(...),
    tissue_type: str = Form(""),
    stain: str = Form("H&E"),
    source_url: str = Form(""),
    license: str = Form(""),
    notes: str = Form(""),
    file: UploadFile = File(...)
):
    if cancer_id not in CANCERS:
        raise HTTPException(status_code=400, detail="Select a valid cancer category.")
    if slot not in (1, 2):
        raise HTTPException(status_code=400, detail="Slot must be 1 or 2.")

    original_name = Path(file.filename or "image").name
    extension = Path(original_name).suffix.lower()
    if extension not in EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Use PNG, JPG, JPEG, TIF or TIFF microscope images."
        )

    with engine.connect() as conn:
        existing = conn.execute(text("""
            SELECT id FROM reference_slides
            WHERE cancer_id=:cancer_id AND slot=:slot
        """), {"cancer_id": cancer_id, "slot": slot}).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="This slot is already occupied. Remove its current image before replacing it."
        )

    folder = STORAGE / cancer_id
    folder.mkdir(parents=True, exist_ok=True)
    slide_id = str(uuid4())
    stored_name = slide_id + extension
    destination = folder / stored_name
    temporary = folder / (stored_name + ".part")
    size = 0

    try:
        with temporary.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_SIZE:
                    raise HTTPException(status_code=413, detail="Maximum upload size is 100 MB.")
                output.write(chunk)

        if size == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        try:
            with Image.open(temporary) as image:
                image.verify()
            with Image.open(temporary) as image:
                width, height = image.size
                detected_format = image.format
        except (UnidentifiedImageError, OSError, ValueError):
            raise HTTPException(status_code=422, detail="The file is not a readable image.")

        os.replace(temporary, destination)
        mime_type = mimetypes.guess_type(original_name)[0] or "application/octet-stream"

        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO reference_slides
                (id, cancer_id, slot, original_name, stored_name, mime_type,
                 size_bytes, width, height, tissue_type, stain, source_url,
                 license, notes)
                VALUES
                (:id, :cancer_id, :slot, :original_name, :stored_name, :mime_type,
                 :size_bytes, :width, :height, :tissue_type, :stain, :source_url,
                 :license, :notes)
            """), {
                "id": slide_id, "cancer_id": cancer_id, "slot": slot,
                "original_name": original_name, "stored_name": stored_name,
                "mime_type": mime_type, "size_bytes": size,
                "width": width, "height": height,
                "tissue_type": tissue_type[:200], "stain": stain[:100],
                "source_url": source_url[:2000], "license": license[:200],
                "notes": notes[:2000]
            })

        return {
            "status": "uploaded",
            "id": slide_id,
            "cancer_id": cancer_id,
            "slot": slot,
            "filename": original_name,
            "width": width,
            "height": height,
            "format": detected_format
        }
    except HTTPException:
        temporary.unlink(missing_ok=True)
        destination.unlink(missing_ok=True)
        raise
    except Exception as exc:
        temporary.unlink(missing_ok=True)
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")
    finally:
        await file.close()


@router.get("/slides/{slide_id}/file")
def get_slide_file(slide_id: str):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT cancer_id, stored_name, mime_type
            FROM reference_slides WHERE id=:id
        """), {"id": slide_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Reference slide not found.")
    path = STORAGE / row["cancer_id"] / row["stored_name"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Stored image file is missing.")
    return FileResponse(path, media_type=row["mime_type"] or "application/octet-stream")


@router.delete("/slides/{slide_id}")
def delete_slide(slide_id: str):
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT cancer_id, stored_name FROM reference_slides WHERE id=:id
        """), {"id": slide_id}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Reference slide not found.")
        conn.execute(text("DELETE FROM reference_slides WHERE id=:id"), {"id": slide_id})

    path = STORAGE / row["cancer_id"] / row["stored_name"]
    path.unlink(missing_ok=True)
    return {"status": "deleted", "id": slide_id}
