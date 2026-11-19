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
  license?: string;
  source_url?: string;
  similarity_score: number;
  image_url: string;
};

type Comparison = {
  method: string;
  references_examined: number;
  references_skipped: number;
  closest_match: Match | null;
  matches: Match[];
  interpretation: string;
  research_notice: string;
};

type Stage = {
  name: string;
  result: Record<string, unknown>;
};

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(`${API}${url}`, {
    cache: "no-store",
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `Request failed: ${response.status}`);
  }
  return data;
}

function getRunId(result: Record<string, unknown>) {
  const id = result.id || result.run_id || result.cellular_run_id ||
    result.morphometry_run_id;
  if (!id) {
    throw new Error("An analysis response did not contain a run ID. Check the backend response.");
  }
  return String(id);
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
  }

  async function uploadAndCompare() {
    if (!file) return;

    setBusy(true);
    setError("");
    setNotice("");
    setComparison(null);
    setStages([]);

    try {
      setProgress("1/2 · Saving original image in Digital Microscopy…");

      const form = new FormData();
      form.append("file", file);

      const uploaded = await requestJson("/microscopy/images", {
        method: "POST",
        body: form,
      });

      setUploadedId(uploaded.id);
      setUploadedName(uploaded.filename || file.name);
      setDimensions(`${uploaded.width} × ${uploaded.height} pixels`);

      setProgress("2/2 · Comparing against the available reference slide library…");

      const comparisonForm = new FormData();
      comparisonForm.append("file", file);

      const result = await requestJson("/reference-matching/compare", {
        method: "POST",
        body: comparisonForm,
      });

      setComparison(result);
      setNotice("Original image saved. Reference comparison completed.");
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload or comparison failed.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  async function runCompleteAnalysis() {
    if (!uploadedId) return;

    setBusy(true);
    setError("");
    setNotice("");
    setStages([]);

    const completed: Stage[] = [];

    async function run(name: string, endpoint: string) {
      setProgress(`Running ${name}…`);
      const result = await requestJson(endpoint, { method: "POST" });
      completed.push({ name, result });
      setStages([...completed]);
      return result as Record<string, unknown>;
    }

    try {
      const imageProcessing = await run(
        "Image Quality & Processing",
        `/image-processing/images/${uploadedId}/analyze`
      );

      const segmentation = await run(
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

      void imageProcessing;
      void segmentation;

      setNotice("All six analysis stages completed successfully.");
      setProgress("");
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Earlier completed stages are preserved below.`
          : "Analysis failed."
      );
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  function printReport() {
    window.print();
  }

  const best = comparison?.closest_match;

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>CYTOGENIX / CANCER INTELLIGENCE</div>
          <h1>Cancer Image Comparison & Analysis</h1>
          <p>
            Upload a microscope image, compare it with the available reference
            collection, and run the existing cellular and tissue analysis pipeline.
          </p>
        </div>
        <span className={styles.status}>EXPERIMENTAL RESEARCH</span>
      </header>

      <section className={styles.notice}>
        <strong>Scientific limitation</strong>
        <p>
          Reference matching identifies the closest image by visual histogram
          similarity. It does not diagnose cancer or establish the tissue category.
          Analysis outputs are experimental and are not validated for clinical use.
        </p>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.success}>{notice}</div>}
      {progress && <div className={styles.progress}>{progress}</div>}

      <section className={styles.panel}>
        <div className={styles.sectionLabel}>01 / ORIGINAL MICROSCOPE IMAGE</div>
        <h2>Upload an iPhone microscope photograph</h2>
        <p>
          Take the photograph through your microscope eyepiece using your iPhone,
          then select the original image here. You can also upload from a computer.
        </p>

        <label className={styles.upload}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/tiff,.tif,.tiff,.bmp"
            capture="environment"
            onChange={(event) => selectFile(event.target.files?.[0] || null)}
          />
          <strong>{file ? file.name : "Choose or capture a microscope image"}</strong>
          <span>
            {file
              ? `${(file.size / 1048576).toFixed(2)} MB`
              : "Select an image from your iPhone or computer"}
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
          <div className={styles.sectionLabel}>02 / REFERENCE IMAGE COMPARISON</div>
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
                  <strong>{best.similarity_score.toFixed(2)}%</strong>
                </div>
              </div>

              <div className={styles.comparisonGrid}>
                <article className={styles.imagePanel}>
                  <div className={styles.imageHeading}>
                    <strong>Uploaded iPhone image</strong>
                    <span>ORIGINAL</span>
                  </div>
                  <img
                    className={styles.specimenImage}
                    src={originalImageUrl}
                    alt="Uploaded iPhone microscope image"
                  />
                </article>
                <article className={styles.imagePanel}>
                  <div className={styles.imageHeading}>
                    <strong>{best.cancer_name}</strong>
                    <span>LIBRARY REFERENCE</span>
                  </div>
                  <img
                    className={styles.specimenImage}
                    src={`${API}${best.image_url.replace("/api/v1", "")}`}
                    alt={`Reference slide: ${best.cancer_name}`}
                  />
                  <p className={styles.muted}>
                    {best.tissue_type || "Tissue not specified"} · {best.stain || "Stain not specified"}
                  </p>
                </article>
              </div>

              <h3>Other closest reference images</h3>
              <div className={styles.matchList}>
                {comparison.matches.map((match) => (
                  <div className={styles.matchRow} key={match.slide_id}>
                    <div>
                      <strong>{match.cancer_name}</strong>
                      <span>{match.filename} · Slot {match.slot}</span>
                    </div>
                    <strong>{match.similarity_score.toFixed(2)}%</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              <h3>No reference images are available yet</h3>
              <p>
                Upload permitted reference images into the Reference Slide Library
                before running a comparison.
              </p>
            </div>
          )}

          <div className={styles.notice}>
            <strong>How to interpret this score</strong>
            <p>{comparison.interpretation}</p>
            <p>{comparison.research_notice}</p>
            <p>
              {comparison.references_examined} reference images examined.
              {comparison.references_skipped
                ? ` ${comparison.references_skipped} unreadable or missing images skipped.`
                : ""}
            </p>
          </div>
        </section>
      )}

      {uploadedId && (
        <section className={styles.panel}>
          <div className={styles.sectionLabel}>03 / INTEGRATED ANALYSIS PIPELINE</div>
          <h2>Run all six analysis stages</h2>
          <p>
            The following existing CYTOGENIX modules will analyse the saved original
            microscopy image. Dependent stages use the run IDs returned by earlier stages.
          </p>

          <div className={styles.stageList}>
            {[
              "Image Quality & Processing",
              "Tissue Segmentation",
              "Cellular Intelligence",
              "Nuclear Morphometry",
              "Spatial Analysis",
              "Tumour Microenvironment",
            ].map((name, index) => {
              const completed = stages.some((stage) => stage.name === name);
              return (
                <div className={styles.stageRow} key={name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{name}</strong>
                  <em className={completed ? styles.complete : ""}>
                    {completed ? "COMPLETED" : "PENDING"}
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
            {busy ? "Analysis running…" : "Run complete cancer image analysis"}
          </button>
        </section>
      )}

      {stages.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.sectionLabel}>04 / ANALYSIS RESULTS</div>
          <h2>Completed analysis outputs</h2>
          {stages.map((stage) => (
            <details className={styles.result} key={stage.name} open>
              <summary>{stage.name}</summary>
              <pre>{JSON.stringify(stage.result, null, 2)}</pre>
            </details>
          ))}
        </section>
      )}

      {(comparison || stages.length > 0) && (
        <section className={styles.panel}>
          <div className={styles.sectionLabel}>05 / CONSOLIDATED REPORT</div>
          <h2>Generate your analysis report</h2>
          <p>
            Open the browser print dialog and choose Save as PDF. Keep this page
            open while generating the report so its images and results are included.
          </p>
          <button className={styles.primary} onClick={printReport}>
            Generate printable report / Save as PDF
          </button>
        </section>
      )}

      <footer>
        CYTOGENIX · Cancer Cellular & Tissue Intelligence · Experimental research only
      </footer>
    </main>
  );
}
