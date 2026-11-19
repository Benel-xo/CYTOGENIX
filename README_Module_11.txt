CYTOGENIX MODULE 11 — TRAINING & MODEL LABORATORY

INSTALL
1. Extract this ZIP into ~/Desktop/CYTOGENIX and allow folders to merge.
2. The included backend/app/main.py is a complete replacement preserving Modules 01–10 and registering Module 11.
3. Terminal 1 — Backend:
   cd "$HOME/Desktop/CYTOGENIX/backend"
   source .venv/bin/activate
   uvicorn app.main:app --reload --port 8000
4. Terminal 2 — Frontend:
   cd "$HOME/Desktop/CYTOGENIX/frontend"
   npm run dev
5. Open http://localhost:3000/workspaces/model-laboratory

DATASET FORMAT
Create folders in ~/Desktop/CYTOGENIX/data/datasets:
  example_dataset/class_a/image_001.png
  example_dataset/class_a/image_002.png
  example_dataset/class_b/image_001.png
  example_dataset/class_b/image_002.png
Use one folder per label/class. At least two readable images per class are required. Supported formats: PNG, JPG/JPEG, TIFF, BMP.

FEATURES
- Dataset discovery and class/image counts.
- Real PyTorch CNN training from random initial weights.
- Apple MPS device when available, otherwise CPU.
- Per-epoch train/validation loss and accuracy saved in PostgreSQL.
- Checkpoints saved under data/models/checkpoints.

SCIENTIFIC LIMITATIONS
This is a baseline educational research implementation, not a validated pathology model. Splitting is image-level, not patient/specimen-level; leakage may occur if related images are present. Small datasets produce unstable metrics. Do not interpret metrics as clinical performance. No diagnosis or treatment guidance is provided.
