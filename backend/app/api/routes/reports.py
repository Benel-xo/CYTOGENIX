from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.db.session import engine

router = APIRouter(prefix="/reports", tags=["Reports & Publications"])


def _ensure_table():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS research_reports (
                report_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                report_type TEXT NOT NULL,
                objective TEXT NOT NULL DEFAULT '',
                methods TEXT NOT NULL DEFAULT '',
                findings TEXT NOT NULL DEFAULT '',
                limitations TEXT NOT NULL DEFAULT '',
                dataset_name TEXT NOT NULL DEFAULT '',
                experiment_id TEXT NOT NULL DEFAULT '',
                evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))


class ReportCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    report_type: str = Field(default="Research report", max_length=80)
    objective: str = Field(default="", max_length=10000)
    methods: str = Field(default="", max_length=20000)
    findings: str = Field(default="", max_length=20000)
    limitations: str = Field(default="", max_length=10000)
    dataset_name: str = Field(default="", max_length=300)
    experiment_id: str = Field(default="", max_length=200)
    evidence: dict[str, Any] = Field(default_factory=dict)


def _serialize(row):
    return {
        "id": row["report_id"],
        "title": row["title"],
        "report_type": row["report_type"],
        "objective": row["objective"],
        "methods": row["methods"],
        "findings": row["findings"],
        "limitations": row["limitations"],
        "dataset_name": row["dataset_name"],
        "experiment_id": row["experiment_id"],
        "evidence": row["evidence"] or {},
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


@router.get("/health")
def reports_health():
    _ensure_table()
    return {"status": "healthy", "module": "Reports & Publications"}


@router.get("")
def list_reports():
    _ensure_table()
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT * FROM research_reports
            ORDER BY updated_at DESC
            LIMIT 200
        """)).mappings().all()
    return {"reports": [_serialize(row) for row in rows], "count": len(rows)}


@router.post("")
def create_report(payload: ReportCreate):
    _ensure_table()
    report_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO research_reports (
                report_id, title, report_type, objective, methods,
                findings, limitations, dataset_name, experiment_id, evidence
            ) VALUES (
                :id, :title, :report_type, :objective, :methods,
                :findings, :limitations, :dataset_name, :experiment_id,
                CAST(:evidence AS jsonb)
            )
        """), {
            "id": report_id,
            "title": payload.title.strip(),
            "report_type": payload.report_type,
            "objective": payload.objective,
            "methods": payload.methods,
            "findings": payload.findings,
            "limitations": payload.limitations,
            "dataset_name": payload.dataset_name,
            "experiment_id": payload.experiment_id,
            "evidence": json.dumps(payload.evidence, default=str),
        })
        row = conn.execute(text("""
            SELECT * FROM research_reports WHERE report_id = :id
        """), {"id": report_id}).mappings().first()
    return {"report": _serialize(row)}


@router.get("/{report_id}")
def get_report(report_id: str):
    _ensure_table()
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT * FROM research_reports WHERE report_id = :id
        """), {"id": report_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    return {"report": _serialize(row)}


@router.delete("/{report_id}")
def delete_report(report_id: str):
    _ensure_table()
    with engine.begin() as conn:
        result = conn.execute(text("""
            DELETE FROM research_reports WHERE report_id = :id
        """), {"id": report_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Report not found.")
    return {"deleted": True, "id": report_id}
