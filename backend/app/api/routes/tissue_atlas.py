from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.db.session import engine

router = APIRouter(prefix="/tissue-atlas", tags=["Tissue Atlas"])


def ensure_tables():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS tissue_atlas_entries (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'General',
                description TEXT NOT NULL DEFAULT '',
                microscopic_features TEXT NOT NULL DEFAULT '',
                research_notes TEXT NOT NULL DEFAULT '',
                image_reference TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS tissue_atlas_notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'General',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))


def serialize(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "description": row["description"],
        "microscopic_features": row["microscopic_features"],
        "research_notes": row["research_notes"],
        "image_reference": row["image_reference"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


def serialize_note(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "category": row["category"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


class EntryInput(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    category: str = Field(default="General", max_length=100)
    description: str = Field(default="", max_length=10000)
    microscopic_features: str = Field(default="", max_length=15000)
    research_notes: str = Field(default="", max_length=15000)
    image_reference: str = Field(default="", max_length=2000)


class NoteInput(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(default="", max_length=20000)
    category: str = Field(default="General", max_length=100)


@router.get("/health")
def health():
    ensure_tables()
    return {"status": "healthy", "module": "Tissue Atlas"}


@router.get("/entries")
def list_entries(search: str = "", category: str = ""):
    ensure_tables()
    query = """
        SELECT * FROM tissue_atlas_entries
        WHERE (
            :search = ''
            OR name ILIKE :pattern
            OR description ILIKE :pattern
            OR microscopic_features ILIKE :pattern
            OR research_notes ILIKE :pattern
        )
        AND (:category = '' OR category = :category)
        ORDER BY updated_at DESC
        LIMIT 500
    """
    with engine.begin() as conn:
        rows = conn.execute(text(query), {
            "search": search.strip(),
            "pattern": f"%{search.strip()}%",
            "category": category.strip(),
        }).mappings().all()
    return {"entries": [serialize(row) for row in rows], "count": len(rows)}


@router.post("/entries")
def create_entry(payload: EntryInput):
    ensure_tables()
    entry_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO tissue_atlas_entries
            (id, name, category, description, microscopic_features,
             research_notes, image_reference)
            VALUES (:id, :name, :category, :description, :features, :notes, :image)
        """), {
            "id": entry_id,
            "name": payload.name.strip(),
            "category": payload.category.strip() or "General",
            "description": payload.description,
            "features": payload.microscopic_features,
            "notes": payload.research_notes,
            "image": payload.image_reference,
        })
        row = conn.execute(text("""
            SELECT * FROM tissue_atlas_entries WHERE id = :id
        """), {"id": entry_id}).mappings().first()
    return {"entry": serialize(row)}


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: str):
    ensure_tables()
    with engine.begin() as conn:
        result = conn.execute(text("""
            DELETE FROM tissue_atlas_entries WHERE id = :id
        """), {"id": entry_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Atlas entry not found.")
    return {"deleted": True, "id": entry_id}


@router.get("/notes")
def list_notes():
    ensure_tables()
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT * FROM tissue_atlas_notes
            ORDER BY created_at DESC LIMIT 500
        """)).mappings().all()
    return {"notes": [serialize_note(row) for row in rows], "count": len(rows)}


@router.post("/notes")
def create_note(payload: NoteInput):
    ensure_tables()
    note_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO tissue_atlas_notes (id, title, content, category)
            VALUES (:id, :title, :content, :category)
        """), {
            "id": note_id,
            "title": payload.title.strip(),
            "content": payload.content,
            "category": payload.category.strip() or "General",
        })
        row = conn.execute(text("""
            SELECT * FROM tissue_atlas_notes WHERE id = :id
        """), {"id": note_id}).mappings().first()
    return {"note": serialize_note(row)}


@router.delete("/notes/{note_id}")
def delete_note(note_id: str):
    ensure_tables()
    with engine.begin() as conn:
        result = conn.execute(text("""
            DELETE FROM tissue_atlas_notes WHERE id = :id
        """), {"id": note_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Research note not found.")
    return {"deleted": True, "id": note_id}
