"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./ResearchAnalysisWorkspace.module.css";
import ResearchReportGenerator from "./ResearchReportGenerator";

const API = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1"
).replace(/\/$/, "");

type JsonRecord = Record<string, unknown>;

type MicroscopyImage = {
  id: string;
  original_name: string;
  file_format?: string;
  width?: number;
  height?: number;
  size_bytes?: number;
  created_at?: string;
};

type AnalysisRun = JsonRecord & {
  run_id?: string;
  report_id?: string;
  image_id?: string;
  results?: JsonRecord;
  metrics?: JsonRecord;
  overlay_url?: string;
  density_url?: string;
  compartments_url?: string;
  immune_mask_url?: string;
  csv_url?: string;
};

const stages = [
  ["quality", "Image quality", "Image characteristics and preparation indicators"],
  ["segmentation", "Tissue segmentation", "Tissue and background region separation"],
  ["cellular", "Cellular intelligence", "Heuristic candidate-region detection"],
  ["morphometry", "Nuclear morphometry", "Geometric measurements from the saved cellular mask"],
  ["spatial", "Spatial analysis", "Candidate-region distribution and clustering"],
  ["microenvironment", "Tumour microenvironment", "Independent tissue-context analysis"],
] as const;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString() : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function assetUrl(path: unknown): string | null {
  if (typeof path !== "string" || !path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  try {
    return new URL(path, API).toString();
  } catch {
    return null;
  }
}

async function apiRequest(
  path: string,
  init: RequestInit = {}
): Promise<JsonRecord> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const raw = await response.text();
  let data: JsonRecord = {};

  try {
    data = raw ? asRecord(JSON.parse(raw)) : {};
  } catch {
    data = { detail: raw || "The server returned an unreadable response." };
  }

  if (!response.ok) {
    const detail = data.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : `The server returned HTTP ${response.status}.`
    );
  }

  return data;
}

function MetricGroup({
  title,
  data,
}: {
  title: string;
  data: unknown;
}) {
  const record = asRecord(data);
  const entries = Object.entries(record).filter(
    ([, value]) =>
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
  );

  if (!entries.length) return null;

  return (
    <div className={styles.metricGroup}>
      <h4>{title.replaceAll("_", " ")}</h4>
      <div className={styles.metrics}>
        {entries.map(([key, value]) => (
          <div className={styles.metric} key={key}>
            <span>{key.replaceAll("_", " ")}</span>
            <strong>{displayValue(value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultPanel({
  title,
  description,
  run,
  images = [],
}: {
  title: string;
  description: string;
  run?: AnalysisRun;
  images?: { label: string; url: unknown }[];
}) {
  if (!run) {
    return (
      <section className={styles.resultPanel}>
        <div className={styles.resultHeading}>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <span className={styles.pending}>Awaiting analysis</span>
        </div>
        <div className={styles.emptyResult}>
          Results will appear here when this analysis has completed.
        </div>
      </section>
    );
  }

  const resultData = asRecord(run.results || run.metrics);
  const summary = asRecord(
    resultData.summary || resultData.spatial_summary
  );

  const metricGroups = [
    ["Analysis summary", summary],
    ["Image quality measurements", resultData],
    ["Analysis measurements", resultData],
  ];

  const seen = new Set<string>();

  return (
    <section className={styles.resultPanel}>
      <div className={styles.resultHeading}>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className={styles.complete}>Completed</span>
      </div>

      <div className={styles.runId}>
        Run ID: <code>{String(run.run_id || run.report_id || "Saved")}</code>
      </div>

      {metricGroups.map(([heading, data], index) => {
        const record = asRecord(data);
        const filtered = Object.fromEntries(
          Object.entries(record).filter(([key]) => {
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
        );
        return (
          <MetricGroup
            key={`${String(heading)}-${index}`}
            title={String(heading)}
            data={filtered}
          />
        );
      })}

      {images.filter((item) => assetUrl(item.url)).length > 0 && (
        <div className={styles.outputImages}>
          {images.map((item) => {
            const url = assetUrl(item.url);
            if (!url) return null;
            return (
              <a
                className={styles.outputImage}
                href={url}
                target="_blank"
                rel="noreferrer"
                key={item.label}
              >
                <img src={url} alt={item.label} />
                <span>{item.label}</span>
                <small>Open full image ↗</small>
              </a>
            );
          })}
        </div>
      )}

      {typeof run.csv_url === "string" && (
        <a
          className={styles.downloadLink}
          href={assetUrl(run.csv_url) || undefined}
          target="_blank"
          rel="noreferrer"
        >
          Download CSV data ↗
        </a>
      )}

      {Array.isArray(resultData.limitations) && (
        <details className={styles.limitations}>
          <summary>Method limitations</summary>
          <ul>
            {(resultData.limitations as unknown[]).map((item, index) => (
              <li key={index}>{displayValue(item)}</li>
            ))}
          </ul>
        </details>
      )}

      <details className={styles.rawData}>
        <summary>View complete result data</summary>
        <pre>{JSON.stringify(run, null, 2)}</pre>
      </details>
    </section>
  );
}

export default function ResearchAnalysisWorkspace() {
  const [images, setImages] = useState<MicroscopyImage[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadingImages, setLoadingImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyStage, setBusyStage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quality, setQuality] = useState<AnalysisRun>();
  const [segmentation, setSegmentation] = useState<AnalysisRun>();
  const [cellular, setCellular] = useState<AnalysisRun>();
  const [morphometry, setMorphometry] = useState<AnalysisRun>();
  const [spatial, setSpatial] = useState<AnalysisRun>();
  const [microenvironment, setMicroenvironment] = useState<AnalysisRun>();

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedId),
    [images, selectedId]
  );

  useEffect(() => {
    let active = true;

    async function loadImages() {
      setLoadingImages(true);
      try {
        const data = await apiRequest("/microscopy/images");
        const list = Array.isArray(data.images)
          ? (data.images as MicroscopyImage[])
          : [];

        if (active) {
          setImages(list);
          if (list.length) setSelectedId(list[0].id);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Could not load microscopy images."
          );
        }
      } finally {
        if (active) setLoadingImages(false);
      }
    }

    loadImages();
    return () => {
      active = false;
    };
  }, []);

  function resetResults() {
    setQuality(undefined);
    setSegmentation(undefined);
    setCellular(undefined);
    setMorphometry(undefined);
    setSpatial(undefined);
    setMicroenvironment(undefined);
    setError("");
    setNotice("");
  }

  function selectImage(id: string) {
    setSelectedId(id);
    resetResults();
  }

  async function runMicroenvironment(imageId: string) {
    setBusyStage("Tumour Microenvironment");
    const result = await apiRequest(
      `/tumour-microenvironment/images/${imageId}/run`,
      {
        method: "POST",
        body: JSON.stringify({
          tissue_saturation_threshold: 12,
          tumour_saturation_threshold: 35,
          immune_saturation_threshold: 35,
          immune_darkness_threshold: 190,
          minimum_region_area: 80,
          maximum_immune_area: 350,
          proximity_distance_pixels: 30,
          morphology_kernel: 3,
        }),
      }
    );
    setMicroenvironment(result as AnalysisRun);
    return result;
  }

  async function runCompleteAnalysis() {
    if (!selectedId || busy) return;

    setBusy(true);
    resetResults();

    try {
      setBusyStage("Image Quality & Processing");
      const qualityResult = await apiRequest(
        `/image-processing/images/${selectedId}/analyze`,
        { method: "POST" }
      );
      setQuality(qualityResult as AnalysisRun);

      setBusyStage("Tissue Segmentation");
      const segmentationResult = await apiRequest(
        `/segmentation/images/${selectedId}/run`,
        {
          method: "POST",
          body: JSON.stringify({
            saturation_threshold: 20,
            brightness_threshold: 245,
            minimum_region_area: 100,
            morphology_kernel: 5,
          }),
        }
      );
      setSegmentation(segmentationResult as AnalysisRun);

      setBusyStage("Cellular Intelligence");
      const cellularResult = await apiRequest(
        `/cellular-intelligence/images/${selectedId}/run`,
        {
          method: "POST",
          body: JSON.stringify({
            saturation_threshold: 35,
            darkness_threshold: 225,
            minimum_nucleus_area: 20,
            maximum_nucleus_area: 5000,
            morphology_kernel: 3,
          }),
        }
      );
      setCellular(cellularResult as AnalysisRun);

      const cellularRunId = cellularResult.run_id;
      if (typeof cellularRunId !== "string" || !cellularRunId) {
        throw new Error(
          "Cellular Intelligence completed without returning a run ID. Later analyses were not started."
        );
      }

      setBusyStage("Nuclear Morphometry");
      const morphometryResult = await apiRequest(
        `/nuclear-morphometry/cellular-runs/${cellularRunId}/analyze`,
        { method: "POST" }
      );
      setMorphometry(morphometryResult as AnalysisRun);

      const morphometryRunId = morphometryResult.run_id;
      if (typeof morphometryRunId !== "string" || !morphometryRunId) {
        throw new Error(
          "Nuclear Morphometry completed without returning a run ID. Spatial Analysis was not started."
        );
      }

      setBusyStage("Spatial Analysis");
      const spatialResult = await apiRequest(
        `/spatial-analysis/morphometry-runs/${morphometryRunId}/analyze`,
        {
          method: "POST",
          body: JSON.stringify({
            grid_rows: 6,
            grid_columns: 6,
            cluster_epsilon_pixels: 45,
            minimum_cluster_points: 4,
          }),
        }
      );
      setSpatial(spatialResult as AnalysisRun);

      setBusyStage("Tumour Microenvironment");
      await runMicroenvironment(selectedId);

      setNotice(
        "The complete analysis sequence has finished. All displayed outputs are saved research results."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The analysis stopped because an unexpected error occurred."
      );
      setNotice(
        "Some stages may have completed and saved results before the error. Review the completed sections below."
      );
    } finally {
      setBusy(false);
      setBusyStage("");
    }
  }

  async function rerunMicroenvironment() {
    if (!selectedId || busy) return;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await runMicroenvironment(selectedId);
      setNotice("Tumour Microenvironment analysis completed.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Microenvironment analysis failed."
      );
    } finally {
      setBusy(false);
      setBusyStage("");
    }
  }

  const completedCount = [
    quality,
    segmentation,
    cellular,
    morphometry,
    spatial,
    microenvironment,
  ].filter(Boolean).length;

  const imagePreview = selectedId
    ? `${API}/microscopy/images/${selectedId}/file`
    : "";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>CYTOGENIX / RESEARCH WORKFLOW</div>
        <div className={styles.titleRow}>
          <div>
            <h1>Integrated Cancer Analysis</h1>
            <p>
              A connected workflow for microscopy image quality, tissue
              segmentation, candidate-region measurements and spatial research.
            </p>
          </div>
          <div className={styles.headerMark}>01 — 06</div>
        </div>
      </header>

      <section className={styles.selectionPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionNumber}>01</span>
            <h2>Select microscopy image</h2>
          </div>
          <span className={styles.sectionHint}>SOURCE IMAGE</span>
        </div>

        {loadingImages ? (
          <p className={styles.muted}>Loading registered microscopy images…</p>
        ) : images.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No registered microscopy images</strong>
            <p>
              Upload an image in Digital Microscopy first. It will then become
              available for integrated analysis here.
            </p>
            <a href="/workspaces/digital-microscopy">Open Digital Microscopy ↗</a>
          </div>
        ) : (
          <>
            <div className={styles.selectRow}>
              <label htmlFor="research-image">Registered image</label>
              <select
                id="research-image"
                value={selectedId}
                onChange={(event) => selectImage(event.target.value)}
                disabled={busy}
              >
                {images.map((image) => (
                  <option value={image.id} key={image.id}>
                    {image.original_name}
                  </option>
                ))}
              </select>
            </div>

            {selectedImage && (
              <div className={styles.sourcePreview}>
                <div className={styles.previewImage}>
                  <img src={imagePreview} alt={selectedImage.original_name} />
                </div>
                <div className={styles.sourceDetails}>
                  <span className={styles.sourceLabel}>SELECTED SOURCE</span>
                  <h3>{selectedImage.original_name}</h3>
                  <p>
                    {selectedImage.file_format || "Microscopy image"}
                    {selectedImage.width && selectedImage.height
                      ? ` · ${selectedImage.width.toLocaleString()} × ${selectedImage.height.toLocaleString()} px`
                      : ""}
                  </p>
                  <small>Image ID: {selectedImage.id}</small>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.workflowPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionNumber}>02</span>
            <h2>Analysis sequence</h2>
          </div>
          <span className={styles.sectionHint}>
            {completedCount} / 6 COMPLETE
          </span>
        </div>

        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${(completedCount / 6) * 100}%` }}
          />
        </div>

        <div className={styles.stageList}>
          {stages.map(([key, title, description], index) => {
            const done = {
              quality,
              segmentation,
              cellular,
              morphometry,
              spatial,
              microenvironment,
            }[key];

            const active = busy && busyStage === title;

            return (
              <div className={styles.stage} key={key}>
                <div className={styles.stageNumber}>
                  {done ? "✓" : String(index + 1).padStart(2, "0")}
                </div>
                <div className={styles.stageText}>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </div>
                <div className={styles.stageStatus}>
                  {active ? (
                    <span className={styles.running}>Running</span>
                  ) : done ? (
                    <span className={styles.complete}>Complete</span>
                  ) : (
                    <span className={styles.pending}>Pending</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.workflowActions}>
          <button
            className={styles.primaryButton}
            onClick={runCompleteAnalysis}
            disabled={!selectedId || busy || loadingImages}
          >
            {busy ? `Running ${busyStage}…` : "Run complete research analysis"}
            {!busy && <span>↗</span>}
          </button>
          <button
            className={styles.secondaryButton}
            onClick={resetResults}
            disabled={busy || completedCount === 0}
          >
            Clear displayed results
          </button>
        </div>

        <p className={styles.workflowNote}>
          The workflow uses the existing registered image and backend analysis
          methods. Later stages use the saved run IDs from earlier stages.
          Tumour Microenvironment runs independently from the same source image.
        </p>
      </section>

      {error && (
        <div className={styles.errorBanner}>
          <strong>Analysis issue</strong>
          <p>{error}</p>
          <small>
            Completed stages remain visible below. Correct the issue before
            rerunning the full workflow.
          </small>
        </div>
      )}

      {notice && <div className={styles.noticeBanner}>{notice}</div>}

      <section className={styles.resultsSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionNumber}>03</span>
            <h2>Research results</h2>
          </div>
          <span className={styles.sectionHint}>SAVED ANALYSIS OUTPUTS</span>
        </div>

        <ResultPanel
          title="Image Quality & Processing"
          description="Image-level brightness, contrast, blur indicator and approximate tissue coverage."
          run={quality}
        />

        <ResultPanel
          title="Tissue Segmentation"
          description="Heuristic tissue mask and image overlay."
          run={segmentation}
          images={[
            { label: "Tissue segmentation overlay", url: segmentation?.overlay_url },
            { label: "Tissue segmentation mask", url: segmentation?.mask_url },
          ]}
        />

        <ResultPanel
          title="Cellular Intelligence"
          description="Candidate-region detection using colour filtering and morphological processing."
          run={cellular}
          images={[
            { label: "Cellular detection overlay", url: cellular?.overlay_url },
            { label: "Candidate-region mask", url: cellular?.mask_url },
          ]}
        />

        <ResultPanel
          title="Nuclear Morphometry"
          description="Geometric measurements derived from the saved Cellular Intelligence mask."
          run={morphometry}
        />

        <ResultPanel
          title="Spatial Analysis"
          description="Candidate-region clusters, spatial grid, density and nearest-neighbour measurements."
          run={spatial}
          images={[
            { label: "Spatial distribution overlay", url: spatial?.overlay_url },
            { label: "Spatial density map", url: spatial?.density_url },
          ]}
        />

        <ResultPanel
          title="Tumour Microenvironment"
          description="Independent colour-heuristic compartment and immune-like candidate analysis."
          run={microenvironment}
          images={[
            { label: "Microenvironment overlay", url: microenvironment?.overlay_url },
            { label: "Compartment map", url: microenvironment?.compartments_url },
            { label: "Immune-like candidate mask", url: microenvironment?.immune_mask_url },
          ]}
        />

        <div className={styles.branchAction}>
          <div>
            <strong>Microenvironment analysis is an independent branch</strong>
            <p>
              You can rerun this analysis without repeating the preceding
              image-quality, segmentation, cellular or morphometry stages.
            </p>
          </div>
          <button
            className={styles.secondaryButton}
            onClick={rerunMicroenvironment}
            disabled={!selectedId || busy}
          >
            {busy && busyStage === "Tumour Microenvironment"
              ? "Running…"
              : "Run microenvironment again"}
          </button>
        </div>
      </section>


      <ResearchReportGenerator
        image={selectedImage}
        imageUrl={imagePreview}
        quality={quality}
        segmentation={segmentation}
        cellular={cellular}
        morphometry={morphometry}
        spatial={spatial}
        microenvironment={microenvironment}
      />

      <section className={styles.scientificNotice}>
        <div className={styles.noticeIcon}>i</div>
        <div>
          <strong>Scientific scope and limitations</strong>
          <p>
            These outputs are computational research measurements. Colour
            thresholding and connected-component methods do not establish
            verified biological cell identities or tumour diagnoses. Candidate
            regions may include artefacts or non-target structures. Measurements
            are generally based on analysis pixels, without micrometre
            calibration. The methods have not been clinically validated and
            must not be used for screening, diagnosis, treatment selection or
            patient management.
          </p>
        </div>
      </section>
    </div>
  );
}
