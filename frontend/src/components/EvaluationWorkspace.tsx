"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./EvaluationWorkspace.module.css";

const API = "http://127.0.0.1:8000/api/v1";

type Epoch = {
  epoch: number;
  train_loss?: number;
  train_accuracy?: number;
  validation_loss?: number;
  validation_accuracy?: number;
};

type Experiment = {
  id: string;
  dataset_name: string;
  status: string;
  results?: {
    history?: Epoch[];
    completed_epochs?: number;
    total_epochs?: number;
    train_images?: number;
    validation_images?: number;
    final_train_loss?: number;
    final_train_accuracy?: number;
    final_validation_loss?: number;
    final_validation_accuracy?: number;
    metrics_note?: string;
    class_names?: string[];
  };
  error?: string | null;
  created_at?: string;
  updated_at?: string;
};

function percent(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : "—";
}

function number(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(4)
    : "—";
}

function date(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export default function EvaluationWorkspace() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/model-laboratory/experiments`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Could not load experiment records.");
      }
      const rows: Experiment[] = Array.isArray(data.experiments)
        ? data.experiments
        : [];
      setExperiments(rows);
      setSelectedId((current) =>
        current && rows.some((item) => item.id === current)
          ? current
          : rows.find((item) => item.status === "completed")?.id || rows[0]?.id || ""
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "API connection failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = experiments.find((item) => item.id === selectedId);
  const results = selected?.results;
  const completed = experiments.filter((item) => item.status === "completed");
  const failed = experiments.filter((item) => item.status === "failed");
  const history = results?.history || [];

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>MODULE 12 / MODEL VALIDATION</div>
          <h1>Evaluation &amp; Reliability</h1>
          <p>
            Inspect recorded model experiments, validation performance and
            training behaviour using actual experiment results.
          </p>
        </div>
        <button className={styles.refresh} onClick={() => void refresh()} disabled={loading}>
          {loading ? "Refreshing..." : "↻ Refresh records"}
        </button>
      </header>

      <section className={styles.metrics}>
        <article>
          <span>EXPERIMENTS RECORDED</span>
          <strong>{experiments.length}</strong>
          <small>All recorded statuses</small>
        </article>
        <article>
          <span>COMPLETED EXPERIMENTS</span>
          <strong>{completed.length}</strong>
          <small>Training status completed</small>
        </article>
        <article>
          <span>FAILED EXPERIMENTS</span>
          <strong>{failed.length}</strong>
          <small>Review error details</small>
        </article>
        <article>
          <span>SELECTED VALIDATION ACCURACY</span>
          <strong>{percent(results?.final_validation_accuracy)}</strong>
          <small>Recorded image-level validation result</small>
        </article>
      </section>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <div className={styles.eyebrow}>EXPERIMENT INSPECTION</div>
            <h2>Recorded experiments</h2>
          </div>
          <span className={styles.count}>{experiments.length} RECORDS</span>
        </div>

        {loading && <p className={styles.muted}>Loading experiment records...</p>}

        {!loading && experiments.length === 0 && (
          <div className={styles.empty}>
            <h3>No experiment records yet</h3>
            <p>
              Evaluation results will appear here after an experiment has been
              recorded by the existing model pipeline. No sample metrics are
              displayed as real results.
            </p>
          </div>
        )}

        {!loading && experiments.length > 0 && (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>DATASET</th>
                  <th>STATUS</th>
                  <th>VALIDATION ACCURACY</th>
                  <th>VALIDATION LOSS</th>
                  <th>LAST UPDATED</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((item) => (
                  <tr key={item.id} className={selectedId === item.id ? styles.activeRow : ""}>
                    <td>{item.dataset_name}</td>
                    <td><span className={`${styles.status} ${styles[item.status] || ""}`}>{item.status}</span></td>
                    <td>{percent(item.results?.final_validation_accuracy)}</td>
                    <td>{number(item.results?.final_validation_loss)}</td>
                    <td>{date(item.updated_at || item.created_at)}</td>
                    <td>
                      <button className={styles.inspect} onClick={() => setSelectedId(item.id)}>
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <div className={styles.eyebrow}>SELECTED EXPERIMENT</div>
                <h2>{selected.dataset_name}</h2>
              </div>
              <span className={`${styles.status} ${styles[selected.status] || ""}`}>{selected.status}</span>
            </div>
            <div className={styles.modelInfo}>
              <div><span>EXPERIMENT ID</span><strong>{selected.id}</strong></div>
              <div><span>TRAINING IMAGES</span><strong>{results?.train_images ?? "—"}</strong></div>
              <div><span>VALIDATION IMAGES</span><strong>{results?.validation_images ?? "—"}</strong></div>
              <div><span>COMPLETED EPOCHS</span><strong>{results?.completed_epochs ?? "—"} / {results?.total_epochs ?? "—"}</strong></div>
            </div>

            {selected.status === "failed" && selected.error && (
              <div className={styles.error}>Experiment error: {selected.error}</div>
            )}

            {selected.status === "completed" && (
              <>
                <h3 className={styles.subheading}>Measured performance</h3>
                <div className={styles.metrics}>
                  <article><span>VALIDATION ACCURACY</span><strong>{percent(results?.final_validation_accuracy)}</strong><small>Measured on validation split</small></article>
                  <article><span>VALIDATION LOSS</span><strong>{number(results?.final_validation_loss)}</strong><small>Final recorded validation loss</small></article>
                  <article><span>TRAIN ACCURACY</span><strong>{percent(results?.final_train_accuracy)}</strong><small>Training split result</small></article>
                  <article><span>TRAIN LOSS</span><strong>{number(results?.final_train_loss)}</strong><small>Final recorded training loss</small></article>
                </div>

                <h3 className={styles.subheading}>Training history</h3>
                {history.length > 0 ? (
                  <div className={styles.history}>
                    {history.map((epoch) => (
                      <div className={styles.epoch} key={epoch.epoch}>
                        <div className={styles.epochTop}>
                          <strong>Epoch {epoch.epoch}</strong>
                          <span>Validation accuracy: {percent(epoch.validation_accuracy)}</span>
                        </div>
                        <div className={styles.track}>
                          <div
                            className={styles.bar}
                            style={{ width: `${Math.max(0, Math.min(100, (epoch.validation_accuracy || 0) * 100))}%` }}
                          />
                        </div>
                        <div className={styles.epochDetails}>
                          <span>Train loss: {number(epoch.train_loss)}</span>
                          <span>Validation loss: {number(epoch.validation_loss)}</span>
                          <span>Train accuracy: {percent(epoch.train_accuracy)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.muted}>No epoch history was stored for this experiment.</p>
                )}

                <h3 className={styles.subheading}>Dataset classes</h3>
                <div className={styles.classes}>
                  {(results?.class_names || []).map((name) => <span key={name}>{name}</span>)}
                  {!results?.class_names?.length && <span>Class information unavailable</span>}
                </div>
              </>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.eyebrow}>METRIC AVAILABILITY</div>
            <h2>Reliability assessment</h2>
            <div className={styles.metricGrid}>
              <div><strong>Available</strong><span>Validation accuracy</span></div>
              <div><strong>Available</strong><span>Validation loss</span></div>
              <div><strong>Available</strong><span>Training history</span></div>
              <div><strong>Not recorded</strong><span>Precision and recall</span></div>
              <div><strong>Not recorded</strong><span>F1-score</span></div>
              <div><strong>Not recorded</strong><span>Confusion matrix</span></div>
              <div><strong>Not recorded</strong><span>ROC-AUC and calibration</span></div>
              <div><strong>Not recorded</strong><span>External validation</span></div>
            </div>
            <p className={styles.note}>
              {results?.metrics_note ||
                "Only metrics actually stored in the selected experiment are displayed. Additional reliability metrics require per-image predictions and suitable independent evaluation data."}
            </p>
          </section>
        </>
      )}

      <section className={styles.disclaimer}>
        <strong>Research evaluation only</strong>
        <p>
          Validation accuracy is an image-level result from the recorded random
          split. It is not a clinical performance estimate. Patient-level or
          specimen-level separation and independent external validation are
          needed before making stronger generalisation claims.
        </p>
      </section>
    </main>
  );
}
