"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./CancerImageComparisonWorkspace.module.css";

const API = "/api/cytogenix";

type Match = {
  slide_id: string;
  cancer_id: string;
  cancer_name: string;
  slot: number;
  filename: string;
  width: number | null;
  height: number | null;
  tissue_type?: string;
  stain?: string;
  similarity_score: number;
  image_url: string;
};

type Comparison = {
  closest_match: Match | null;
  interpretation?: string;
  research_notice?: string;
  references_examined?: number;
  references_skipped?: number;
};

type Stage = {
  name: string;
  result: Record<string, unknown>;
};

function humanize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isHiddenKey(key: string) {
  return /(^id$|_id$|^id_|created_at|updated_at|stored_name|file_path|image_url|mask_url|overlay_url|raw_data|debug|traceback)/i.test(key);
}

function ResultValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span>Not available</span>;
  }

  if (typeof value === "boolean") {
    return <span>{value ? "Yes" : "No"}</span>;
  }

  if (typeof value === "number") {
    return <span>{Number.isFinite(value) ? Number(value.toFixed(3)).toString() : "Not available"}</span>;
  }

  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) return <span>Available</span>;
    return <span>{value}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>None recorded</span>;
    return (
      <div className={styles.readableList}>
        {value.slice(0, 12).map((item, index) => (
          <div className={styles.readableItem} key={index}>
            {typeof item === "object" && item !== null
              ? <ResultValue value={item} />
              : <span>{String(item)}</span>}
          </div>
        ))}
        {value.length > 12 && <span>And {value.length - 12} more items</span>}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => !isHiddenKey(key) && item !== undefined && item !== null);

    if (entries.length === 0) return <span>Analysis completed</span>;

    return (
      <div className={styles.readableNested}>
        {entries.map(([key, item]) => (
          <div className={styles.readableMetric} key={key}>
            <span>{humanize(key)}</span>
            <strong><ResultValue value={item} /></strong>
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

function getRunId(result: Record<string, unknown>): string {
  const preferred = [
    "cellular_run_id",
    "morphometry_run_id",
    "analysis_run_id",
    "run_id",
    "cellular_analysis_id",
    "morphometry_id",
    "analysis_id",
    "id",
  ];

  for (const key of preferred) {
    const value = result[key];
    if (typeof value === "string" || typeof value === "number") {
      if (String(value).trim()) return String(value);
    }
  }

  for (const key of ["data", "result", "run", "analysis"]) {
    const nested = result[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      try {
        return getRunId(nested as Record<string, unknown>);
      } catch {}
    }
  }

  throw new Error("An analysis stage completed but did not return its required run identifier. Please share the stage name shown above.");
}

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : "The analysis could not be completed.";
  if (/traceback|exception|internal server error/i.test(message)) {
    return "The analysis service encountered an internal error. Check that the backend is running, then try again.";
  }
  return message.slice(0, 500);
}

async function requestJson(url: string, options?: RequestInit) {
  let response: Response;

  try {
    response = await fetch(`${API}${url}`, {
      cache: "no-store",
      ...options,
    });
  } catch {
    throw new Error("CYTOGENIX could not reach the backend. Check that Terminal 1 is running.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "";
    if (response.status === 404) {
      throw new Error("The requested analysis endpoint was not found. The backend route may not be registered.");
    }
    if (response.status >= 500) {
      throw new Error("The backend encountered an error while processing this analysis stage.");
    }
    throw new Error(detail || `The request could not be completed (${response.status}).`);
  }

  return data;
}

export default function CancerImageComparisonWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadedId, setUploadedId] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const originalImageUrl = useMemo(
    () => uploadedId ? `${API}/microscopy/images/${uploadedId}/file` : "",
    [uploadedId]
  );

  function selectFile(selected: File | null) {
    setFile(selected);
    setUploadedId("");
    setUploadedName("");
    setDimensions("");
    setComparison(null);
    setStages([]);
    setError("");
    setNotice("");
    setProgress("");
  }

  async function uploadAndCompare() {
    if (!file) return;

    setBusy(true);
    setError("");
    setNotice("");
    setComparison(null);
    setStages([]);

    try {
      setProgress("Saving your original microscope image…");

      const form = new FormData();
      form.append("file", file);

      const uploaded = await requestJson("/microscopy/images", {
        method: "POST",
        body: form,
      });

      setUploadedId(String(uploaded.id));
      setUploadedName(uploaded.filename || file.name);
      setDimensions(
        uploaded.width && uploaded.height
          ? `${uploaded.width} × ${uploaded.height} pixels`
          : ""
      );

      setProgress("Finding the closest reference image…");

      const comparisonForm = new FormData();
      comparisonForm.append("file", file);

      const result = await requestJson("/reference-matching/compare", {
        method: "POST",
        body: comparisonForm,
      });

      setComparison(result);
      setNotice("Your image has been saved and the reference comparison is complete.");
      setProgress("");
    } catch (err) {
      setError(readableError(err));
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  async function runCompleteAnalysis() {
    if (!uploadedId || busy) return;

    setBusy(true);
    setError("");
    setNotice("");
    setStages([]);

    const completed: Stage[] = [];

    async function run(name: string, endpoint: string) {
      setProgress(`Running ${name}…`);
      const result = await requestJson(endpoint, { method: "POST" });

      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error(`${name} returned an unexpected result.`);
      }

      completed.push({ name, result: result as Record<string, unknown> });
      setStages([...completed]);
      return result as Record<string, unknown>;
    }

    try {
      await run(
        "Image Quality & Processing",
        `/image-processing/images/${uploadedId}/analyze`
      );

      await run(
        "Tissue Segmentation",
        `/segmentation/images/${uploadedId}/run`
      );

      const cellular = await run(
        "Cellular Intelligence",
        `/cellular-intelligence/images/${uploadedId}/run`
      );

      const cellularRunId = getRunId(cellular);

      const morphometry = await run(
        "Nuclear Morphometry",
        `/nuclear-morphometry/cellular-runs/${cellularRunId}/analyze`
      );

      const morphometryRunId = getRunId(morphometry);

      await run(
        "Spatial Analysis",
        `/spatial-analysis/morphometry-runs/${morphometryRunId}/analyze`
      );

      await run(
        "Tumour Microenvironment",
        `/tumour-microenvironment/images/${uploadedId}/run`
      );

      setNotice("All six analysis stages have completed successfully.");
      setProgress("");
    } catch (err) {
      setError(readableError(err));
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  function printReport() {
    window.print();
  }

  const best = comparison?.closest_match;

  const stageNames = [
    "Image Quality & Processing",
    "Tissue Segmentation",
    "Cellular Intelligence",
    "Nuclear Morphometry",
    "Spatial Analysis",
    "Tumour Microenvironment",
  ];

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>CYTOGENIX / CANCER INTELLIGENCE</div>
          <h1>Cancer Image Comparison & Analysis</h1>
          <p>
            Upload a microscope image, compare it with the reference collection,
            and review the available research measurements.
          </p>
        </div>
        <span className={styles.status}>EXPERIMENTAL RESEARCH</span>
      </header>

      <section className={styles.notice}>
        <strong>Research use only</strong>
        <p>
          The reference result is the closest visual match in the current library.
          It is not a cancer diagnosis, a probability, or a clinically validated result.
        </p>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.success}>{notice}</div>}
      {progress && <div className={styles.progress}>{progress}</div>}

      <section className={styles.panel}>
        <div className={styles.sectionLabel}>01 / ORIGINAL MICROSCOPE IMAGE</div>
        <h2>Upload a microscope photograph</h2>
        <p>
          Transfer the original iPhone photograph to your Mac, then select it here.
        </p>

        <label className={styles.upload}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/tiff,.tif,.tiff,.bmp"
            onChange={(event) => selectFile(event.target.files?.[0] || null)}
          />
          <strong>{file ? file.name : "Choose a microscope image"}</strong>
          <span>
            {file
              ? `${(file.size / 1048576).toFixed(2)} MB`
              : "PNG, JPEG or TIFF · preferably under 20 MB"}
          </span>
        </label>

        {(previewUrl || originalImageUrl) && (
          <div className={styles.imagePanel}>
            <div className={styles.imageHeading}>
              <strong>Uploaded specimen image</strong>
              <span>{uploadedId ? "SAVED ORIGINAL" : "LOCAL PREVIEW"}</span>
            </div>
            <img
              className={styles.specimenImage}
              src={originalImageUrl || previewUrl}
              alt="Original microscope specimen"
            />
            <p className={styles.muted}>
              {uploadedName || file?.name}
              {dimensions ? ` · ${dimensions}` : ""}
            </p>
          </div>
        )}

        <button
          className={styles.primary}
          disabled={!file || busy}
          onClick={() => void uploadAndCompare()}
        >
          {busy ? "Please wait…" : "Save image & find closest reference"}
        </button>
      </section>

      {comparison && (
        <section className={styles.panel}>
          <div className={styles.sectionLabel}>02 / REFERENCE COMPARISON</div>
          <h2>Closest reference match</h2>

          {best ? (
            <>
              <div className={styles.matchSummary}>
                <div>
                  <small>CLOSEST REFERENCE CATEGORY</small>
                  <strong>{best.cancer_name}</strong>
                  <span>Reference slide {best.slot} · {best.filename}</span>
                </div>
                <div className={styles.score}>
                  <small>VISUAL SIMILARITY</small>
                  <strong>{Number(best.similarity_score).toFixed(2)}%</strong>
                </div>
              </div>

              <div className={styles.comparisonGrid}>
                <article className={styles.imagePanel}>
                  <div className={styles.imageHeading}>
                    <strong>Your microscope image</strong>
                    <span>UPLOADED IMAGE</span>
                  </div>
                  <img
                    className={styles.specimenImage}
                    src={originalImageUrl}
                    alt="Uploaded microscope image"
                  />
                </article>
                <article className={styles.imagePanel}>
                  <div className={styles.imageHeading}>
                    <strong>{best.cancer_name}</strong>
                    <span>REFERENCE IMAGE</span>
                  </div>
                  <img
                    className={styles.specimenImage}
                    src={`${API}${best.image_url.replace("/api/v1", "")}`}
                    alt={`Reference slide for ${best.cancer_name}`}
                  />
                  <p className={styles.muted}>
                    {best.tissue_type || "Tissue not specified"} · {best.stain || "Stain not specified"}
                  </p>
                </article>
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              <h3>No reference images are available</h3>
              <p>
                Add reference images in the Reference Slide Library before comparing.
              </p>
            </div>
          )}

          <div className={styles.notice}>
            <strong>How to interpret this result</strong>
            <p>
              {comparison.interpretation ||
                "This is the closest visual match found in the current reference collection."}
            </p>
            <p>
              {comparison.research_notice ||
                "Visual similarity does not establish a cancer type or diagnosis."}
            </p>
          </div>
        </section>
      )}

      {uploadedId && (
        <section className={styles.panel}>
          <div className={styles.sectionLabel}>03 / INTEGRATED ANALYSIS</div>
          <h2>Complete research analysis</h2>
          <p>
            Run the six available research modules on your saved microscope image.
          </p>

          <div className={styles.stageList}>
            {stageNames.map((name, index) => {
              const completed = stages.some((stage) => stage.name === name);
              return (
                <div className={styles.stageRow} key={name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{name}</strong>
                  <em className={completed ? styles.complete : ""}>
                    {completed ? "COMPLETED" : "WAITING"}
                  </em>
                </div>
              );
            })}
          </div>

          <button
            className={styles.primary}
            disabled={busy}
            onClick={() => void runCompleteAnalysis()}
          >
            {busy ? "Analysis running…" : "Run complete research analysis"}
          </button>
        </section>
      )}

      {stages.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.sectionLabel}>04 / RESEARCH FINDINGS</div>
          <h2>Analysis results</h2>
          <p className={styles.muted}>
            Results below are measurements returned by the experimental research modules.
          </p>

          {stages.map((stage) => (
            <article className={styles.resultCard} key={stage.name}>
              <h3>{stage.name}</h3>
              <ResultValue value={stage.result} />
            </article>
          ))}
        </section>
      )}

      {(comparison || stages.length > 0) && (
        <section className={styles.panel}>
          <div className={styles.sectionLabel}>05 / RESEARCH REPORT</div>
          <h2>Generate report</h2>
          <p>
            Create a printable summary of the image, reference comparison and completed
            analysis results. Choose Save as PDF in the print dialog.
          </p>
          <button className={styles.primary} onClick={printReport}>
            Generate report / Save as PDF
          </button>
        </section>
      )}

      <footer>
        CYTOGENIX · Cancer Cellular & Tissue Intelligence · Experimental research only
      </footer>
    </main>
  );
}
