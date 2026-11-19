from fastapi import APIRouter
from sqlalchemy import text
from app.db.session import engine

router = APIRouter(tags=["System"])

@router.get("/health")
def health_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "api": "online",
            "database": "connected",
            "platform": "CYTOGENIX",
        }
    except Exception as exc:
        return {
            "status": "degraded",
            "api": "online",
            "database": "disconnected",
            "error": str(exc),
        }
