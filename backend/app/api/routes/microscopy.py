from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import text
from PIL import Image, UnidentifiedImageError
import mimetypes
import os

from app.db.session import engine

router = APIRouter(prefix="/microscopy", tags=["Digital Microscopy"])

PROJECT_ROOT = Path(__file__).resolve().parents[4]
UPLOAD_DIR = PROJECT_ROOT / "data" / "raw"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".svs", ".tif", ".tiff", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024

def initialise_table():
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS microscopy_images (
                id VARCHAR(36) PRIMARY KEY,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                file_format VARCHAR(20) NOT NULL,
                size_bytes BIGINT NOT NULL,
                width BIGINT,
                height BIGINT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))

initialise_table()

def inspect_image(path: Path, extension: str):
    if extension == ".svs":
        try:
            import openslide
            slide = openslide.OpenSlide(str(path))
            width, height = slide.dimensions
            slide.close()
            return width, height
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"OpenSlide could not read this slide: {exc}"
            )

    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            return image.width, image.height
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=422,
            detail="The uploaded file is not a readable image."
        )

@router.post("/images")
async def upload_image(file: UploadFile = File(...)):
    original_name = Path(file.filename or "unnamed").name
    extension = Path(original_name).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type. Upload SVS, TIFF, PNG or JPEG images."
        )

    image_id = str(uuid4())
    stored_name = f"{image_id}{extension}"
    destination = UPLOAD_DIR / stored_name
    temporary = UPLOAD_DIR / f"{stored_name}.part"
    size = 0

    try:
        with temporary.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds the 2 GB upload limit."
                    )
                output.write(chunk)

        if size == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        width, height = inspect_image(temporary, extension)
        os.replace(temporary, destination)

        with engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO microscopy_images
                    (id, original_name, stored_name, file_format, size_bytes, width, height)
                    VALUES (:id, :original_name, :stored_name, :file_format, :size_bytes, :width, :height)
                """),
                {
                    "id": image_id,
                    "original_name": original_name,
                    "stored_name": stored_name,
                    "file_format": extension.lstrip(".").upper(),
                    "size_bytes": size,
                    "width": width,
                    "height": height,
                }
            )

        return {
            "id": image_id,
            "filename": original_name,
            "format": extension.lstrip(".").upper(),
            "size_bytes": size,
            "width": width,
            "height": height,
            "status": "uploaded",
            "message": "Image stored and metadata registered."
        }

    except HTTPException:
        temporary.unlink(missing_ok=True)
        raise
    except Exception as exc:
        temporary.unlink(missing_ok=True)
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")
    finally:
        await file.close()

@router.get("/images")
def list_images():
    with engine.connect() as connection:
        rows = connection.execute(text("""
            SELECT id, original_name, file_format, size_bytes, width, height, created_at
            FROM microscopy_images
            ORDER BY created_at DESC
        """)).mappings().all()

    return {"images": [dict(row) for row in rows]}

@router.get("/images/{image_id}/file")
def get_image_file(image_id: str):
    with engine.connect() as connection:
        row = connection.execute(
            text("SELECT stored_name FROM microscopy_images WHERE id = :id"),
            {"id": image_id}
        ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Image not found.")

    path = UPLOAD_DIR / row["stored_name"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image file is missing.")

    return FileResponse(
        path,
        media_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    )
