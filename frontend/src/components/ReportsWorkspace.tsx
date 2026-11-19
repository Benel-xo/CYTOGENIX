"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ReportsWorkspace.module.css";

const API = "http://127.0.0.1:8000/api/v1";

type Report = {
  id: string;
  title: string;
  report_type: string;
  objective: string;
  methods: string;
  findings: string;
  limitations: string;
  dataset_name: string;
  experiment_id: string;
  evidence: Record<string, unknown>;
  created_at?: string;
};

type Experiment = {
  id: string;
  dataset_name: string;
  status: string;
  results?: {
    final_train_accuracy?: number;
    final_validation_accuracy?: number;
    final_validation_loss?: number;
    completed_epochs?: number;
    total_epochs?: number;
    train_images?: number;
    validation_images?: number;
  };
};

const emptyForm = {
  title: "",
  report_type: "Research report",
  objective: "",
  methods: "",
  findings: "",
  limitations: "",
  dataset_name: "",
  experiment_id: "",
};

function date(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function markdown(report: Report) {
  return `# ${report.title}

**Report type:** ${report.report_type}

**Created:** ${date(report.created_at)}

**Dataset:** ${report.dataset_name || "Not specified"}

**Experiment ID:** ${report.experiment_id || "Not specified"}

## Objective

${report.objective || "Not provided."}

## Methods

${report.methods || "Not provided."}

## Findings

${report.findings || "Not provided."}

## Limitations

${report.limitations || "Not provided."}

---

*Prepared in CYTOGENIX Reports & Publications. Research documentation only; not for clinical diagnosis or patient management.*
`;
}

export default function ReportsWorkspace() {
  const [reports, setReports] = useState<Report[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reportResponse, experimentResponse] = await Promise.all([
        fetch(`${API}/reports`, { cache: "no-store" }),
        fetch(`${API}/model-laboratory/experiments`, { cache: "no-store" }),
      ]);

      const reportData = await reportResponse.json();
      if (!reportResponse.ok) {
        throw new Error(reportData.detail || "Could not load saved reports.");
      }
      setReports(Array.isArray(reportData.reports) ? reportData.reports : []);

      if (experimentResponse.ok) {
        const experimentData = await experimentResponse.json();
        setExperiments(
          Array.isArray(experimentData.experiments)
            ? experimentData.experiments
            : []
        );
      } else {
        setExperiments([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to the API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectExperiment(id: string) {
    const experiment = experiments.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      experiment_id: id,
      dataset_name: experiment?.dataset_name || current.dataset_name,
    }));
  }

  async function saveReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const experiment = experiments.find((item) => item.id === form.experiment_id);
      const response = await fetch(`${API}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          evidence: experiment
            ? {
                experiment_status: experiment.status,
                recorded_results: experiment.results || {},
              }
            : {},
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Could not save the report.");
      }

      const saved: Report = data.report;
      setReports((current) => [saved, ...current]);
      setSelected(saved);
      setForm(emptyForm);
      setMessage("Report saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the report.");
    } finally {
      setSaving(false);
    }
  }

  function exportReport(report: Report) {
    const blob = new Blob([markdown(report)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report.title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "cytogenix-report"}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function removeReport(report: Report) {
    if (!window.confirm(`Delete "${report.title}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(`${API}/reports/${report.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Delete failed.");
      setReports((current) => current.filter((item) => item.id !== report.id));
      if (selected?.id === report.id) setSelected(null);
      setMessage("Report deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete report.");
    }
  }

  const completedExperiments = experiments.filter((item) => item.status === "completed");

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>MODULE 14 / SCIENTIFIC DOCUMENTATION</div>
          <h1>Reports &amp; Publications</h1>
          <p>
            Create structured research reports, connect recorded experiments,
            and export documentation for further scientific editing.
          </p>
        </div>
        <button className={styles.refresh} onClick={() => void refresh()} disabled={loading}>
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>
      </header>

      <section className={styles.metrics}>
        <article><span>SAVED REPORTS</span><strong>{reports.length}</strong><small>Stored in the research database</small></article>
        <article><span>RECORDED EXPERIMENTS</span><strong>{experiments.length}</strong><small>Retrieved from the model laboratory</small></article>
        <article><span>COMPLETED EXPERIMENTS</span><strong>{completedExperiments.length}</strong><small>Recorded status: completed</small></article>
        <article><span>EXPORT FORMAT</span><strong>MD</strong><small>Editable Markdown document</small></article>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.success}>{message}</div>}

      <div className={styles.columns}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <div className={styles.eyebrow}>REPORT EDITOR</div>
              <h2>Create a research report</h2>
            </div>
            <span className={styles.tag}>NEW REPORT</span>
          </div>

          <form onSubmit={saveReport} className={styles.form}>
            <label>
              Report title
              <input required minLength={3} maxLength={200} value={form.title}
                onChange={(event) => update("title", event.target.value)}
                placeholder="e.g. Colorectal tissue image analysis" />
            </label>

            <label>
              Report type
              <select value={form.report_type}
                onChange={(event) => update("report_type", event.target.value)}>
                <option>Research report</option>
                <option>Experimental methods</option>
                <option>Dataset report</option>
                <option>Model evaluation report</option>
                <option>Publication draft</option>
                <option>Technical documentation</option>
              </select>
            </label>

            <label>
              Link a recorded experiment (optional)
              <select value={form.experiment_id} onChange={(event) => selectExperiment(event.target.value)}>
                <option value="">No experiment selected</option>
                {experiments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.dataset_name} · {item.status} · {item.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Dataset name
              <input value={form.dataset_name}
                onChange={(event) => update("dataset_name", event.target.value)}
                placeholder="Dataset or image collection name" />
            </label>

            <label>
              Research objective
              <textarea value={form.objective}
                onChange={(event) => update("objective", event.target.value)}
                placeholder="Describe the research question and objectives." rows={3} />
            </label>

            <label>
              Methods
              <textarea value={form.methods}
                onChange={(event) => update("methods", event.target.value)}
                placeholder="Describe datasets, preparation, methods and experimental settings." rows={4} />
            </label>

            <label>
              Findings
              <textarea value={form.findings}
                onChange={(event) => update("findings", event.target.value)}
                placeholder="Enter observed findings. Only include results supported by your actual experiments." rows={4} />
            </label>

            <label>
              Limitations and notes
              <textarea value={form.limitations}
                onChange={(event) => update("limitations", event.target.value)}
                placeholder="Document limitations, uncertainties and future work." rows={3} />
            </label>

            <button className={styles.primary} type="submit" disabled={saving}>
              {saving ? "Saving report..." : "Save research report"}
            </button>
          </form>
        </section>

        <div className={styles.rightColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <div className={styles.eyebrow}>REPORT ARCHIVE</div>
                <h2>Saved reports</h2>
              </div>
              <span className={styles.tag}>{reports.length} RECORDS</span>
            </div>

            {loading && <p className={styles.muted}>Loading reports...</p>}
            {!loading && reports.length === 0 && (
              <div className={styles.empty}>
                <h3>No reports saved yet</h3>
                <p>Create your first report using the editor. It will be stored in the CYTOGENIX database.</p>
              </div>
            )}

            <div className={styles.reportList}>
              {reports.map((report) => (
                <button key={report.id}
                  className={`${styles.reportItem} ${selected?.id === report.id ? styles.active : ""}`}
                  onClick={() => setSelected(report)}>
                  <strong>{report.title}</strong>
                  <span>{report.report_type}</span>
                  <small>{date(report.created_at)}</small>
                </button>
              ))}
            </div>
          </section>

          {selected && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <div className={styles.eyebrow}>REPORT PREVIEW</div>
                  <h2>{selected.title}</h2>
                </div>
                <span className={styles.tag}>SAVED</span>
              </div>
              <div className={styles.preview}>
                <p><b>Type:</b> {selected.report_type}</p>
                <p><b>Dataset:</b> {selected.dataset_name || "Not specified"}</p>
                <p><b>Experiment:</b> {selected.experiment_id || "Not linked"}</p>
                <h3>Objective</h3><p>{selected.objective || "Not provided."}</p>
                <h3>Methods</h3><p>{selected.methods || "Not provided."}</p>
                <h3>Findings</h3><p>{selected.findings || "Not provided."}</p>
                <h3>Limitations</h3><p>{selected.limitations || "Not provided."}</p>
              </div>
              <div className={styles.actions}>
                <button className={styles.primary} onClick={() => exportReport(selected)}>Export Markdown</button>
                <button className={styles.delete} onClick={() => void removeReport(selected)}>Delete report</button>
              </div>
            </section>
          )}

          <section className={styles.notice}>
            <strong>Scientific integrity</strong>
            <p>Reports store the information entered by the researcher and references to recorded experiments. They do not independently validate results or establish clinical performance. Verify all findings before publication.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
