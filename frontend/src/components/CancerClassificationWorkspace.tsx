"use client";

import { useEffect, useState } from "react";
import styles from "./CancerClassificationWorkspace.module.css";

const API = "http://127.0.0.1:8000/api/v1";

type Model = {
  experiment_id: string;
  dataset_name: string;
  class_names: string[];
  validation_accuracy: number | null;
  updated_at: string | null;
};

type Prediction = {
  predicted_class: string;
  scores: { class_name: string; softmax_score: number }[];
  filename: string;
  dataset_name: string;
  architecture: string;
  interpretation: string;
  research_notice: string;
};

export default function CancerClassificationWorkspace() {
  const [models, setModels] = useState<Model[]>([]);
  const [selected, setSelected] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/cancer-classification/models`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load trained models.");
      setModels(data.models || []);
      setSelected((current: string) =>
        data.models?.some((m: Model) => m.experiment_id === current)
          ? current
          : data.models?.[0]?.experiment_id || ""
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "API connection failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function runPrediction() {
    if (!file || !selected) return;
    setRunning(true);
    setError("");
    setMessage("");
    setPrediction(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `${API}/cancer-classification/predict/${selected}`,
        { method: "POST", body: form }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Prediction failed.");
      setPrediction(data);
      setMessage("Research inference completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prediction failed.");
    } finally {
      setRunning(false);
    }
  }

  const activeModel = models.find((m) => m.experiment_id === selected);

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>MODULE 04 / EXPERIMENTAL MACHINE LEARNING</div>
          <h1>Cancer AI Classification</h1>
          <p>Run image-level research inference using trained CYTOGENIX model checkpoints.</p>
        </div>
        <button className={styles.secondary} onClick={() => void refresh()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh models"}
        </button>
      </header>

      <section className={styles.notice}>
        <strong>Research-only system</strong>
        <p>
          This experimental classifier is not clinically validated. Its softmax
          scores are not calibrated probabilities or diagnostic confidence.
          Do not use it for patient care, screening, or medical decisions.
        </p>
      </section>

      <section className={styles.metrics}>
        <article><small>AVAILABLE MODELS</small><strong>{models.length}</strong><span>Completed checkpoints</span></article>
        <article><small>ARCHITECTURE</small><strong>SmallCNN v1</strong><span>Trained model architecture</span></article>
        <article><small>INPUT FORMAT</small><strong>128 × 128</strong><span>RGB image preprocessing</span></article>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.success}>{message}</div>}

      <section className={styles.panel}>
        <div className={styles.sectionLabel}>01 / MODEL SELECTION</div>
        <h2>Select a trained cancer model</h2>
        {loading ? <p>Loading completed model checkpoints…</p> :
          models.length === 0 ? (
            <div className={styles.empty}>
              <h3>No trained models available yet</h3>
              <p>
                A compatible trained model checkpoint is required before predictions can be generated. A model
                appears here only after training completes and its checkpoint is saved.
              </p>
              
            </div>
          ) : (
            <>
              <label className={styles.field}>
                <span>Trained experiment</span>
                <select value={selected} onChange={(e) => {
                  setSelected(e.target.value);
                  setPrediction(null);
                }}>
                  {models.map((model) => (
                    <option key={model.experiment_id} value={model.experiment_id}>
                      {model.dataset_name} — {model.experiment_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              {activeModel && (
                <div className={styles.modelInfo}>
                  <div><small>DATASET</small><strong>{activeModel.dataset_name}</strong></div>
                  <div><small>TRAINED CLASSES</small><strong>{activeModel.class_names.join(", ") || "Not listed"}</strong></div>
                  <div><small>VALIDATION ACCURACY</small><strong>
                    {activeModel.validation_accuracy == null
                      ? "Not recorded"
                      : `${(activeModel.validation_accuracy * 100).toFixed(2)}%`}
                  </strong></div>
                </div>
              )}
            </>
          )}
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionLabel}>02 / IMAGE INFERENCE</div>
        <h2>Upload a research image</h2>
        <p>Accepted formats: PNG, JPG, TIFF and BMP. Maximum size: 20 MB.</p>
        <label className={styles.upload}>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.tif,.tiff,.bmp,image/*"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPrediction(null);
              setMessage("");
            }}
          />
          <strong>{file ? file.name : "Choose a microscopy image"}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Select an image from your device"}</span>
        </label>
        {file && (
          <div className={styles.preview}>
            <img src={URL.createObjectURL(file)} alt="Selected research image preview" />
          </div>
        )}
        <button
          className={styles.primary}
          disabled={!file || !selected || running || loading}
          onClick={() => void runPrediction()}
        >
          {running ? "Running inference…" : "Run experimental classification"}
        </button>
      </section>

      {prediction && (
        <section className={styles.panel}>
          <div className={styles.sectionLabel}>03 / MODEL OUTPUT</div>
          <h2>Classification results</h2>
          <div className={styles.predicted}>
            <small>TOP MODEL OUTPUT</small>
            <strong>{prediction.predicted_class}</strong>
            <span>{prediction.dataset_name} · {prediction.architecture}</span>
          </div>
          <h3>Class softmax scores</h3>
          <p className={styles.muted}>These scores are uncalibrated and must not be interpreted as disease probabilities.</p>
          {prediction.scores.map((score) => (
            <div className={styles.score} key={score.class_name}>
              <div><strong>{score.class_name}</strong><span>{score.softmax_score.toFixed(3)}%</span></div>
              <div className={styles.track}><div style={{ width: `${Math.max(0, Math.min(100, score.softmax_score))}%` }} /></div>
            </div>
          ))}
          <div className={styles.notice}>
            <strong>Interpretation limitation</strong>
            <p>{prediction.interpretation}</p>
            <p>{prediction.research_notice}</p>
          </div>
        </section>
      )}

      <footer>CYTOGENIX · Computational pathology cancer analysis platform · Experimental, not for clinical use</footer>
    </main>
  );
}
