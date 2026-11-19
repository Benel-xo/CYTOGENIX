# CYTOGENIX

Computational Cytology and Intelligent Histopathology Research Platform.

## Technology
- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Python, FastAPI
- Database: PostgreSQL
- Scientific computing: PyTorch, OpenCV, NumPy, scikit-image, pandas
- Experiment tracking: MLflow

## Development
Frontend:
    cd frontend
    npm run dev

Backend:
    cd backend
    source .venv/bin/activate
    uvicorn app.main:app --reload --port 8000

Frontend: http://localhost:3000
Backend: http://localhost:8000
API documentation: http://localhost:8000/docs

## Scientific disclaimer
CYTOGENIX is an experimental biomedical research and educational platform.
Its outputs are not intended for clinical diagnosis, screening, treatment
decisions or patient management. Research results require independent
validation and appropriate scientific review.
