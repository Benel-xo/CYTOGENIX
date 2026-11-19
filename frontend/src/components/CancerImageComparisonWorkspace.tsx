"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./CancerImageComparisonWorkspace.module.css";
import ResearchReportGenerator from "./ResearchReportGenerator";

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
};

type Stage = {
  name: string;
  result: Record<string, unknown>;
  images: { label: string; url: string }[];
};

const STAGE_NAMES = [
  "Image Quality & Processing",
  "Tissue Segmentation",
  "Cellular Intelligence",
  "Nuclear Morphometry",
  "Spatial Analysis",
  "Tumour Microenvironment",
];

function imageUrl(path: unknown): string | null {
  if (typeof path !== "string" || !path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api/v1")) return API + path.replace("/api/v1", "");
  if (path.startsWith("/")) return API + path;
  return null;
}

function humanize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRunId(result: Record<string, unknown>): string {
  for (const key of [
    "run_id", "morphometry_run_id",
    "analysis_run_id", "cellular_run_id", "id",
  ]) {
    const value = result[key];
    if (typeof value === "string" || typeof value === "number") {
      if (String(value).trim()) return String(value);
    }
  }

  for (const key of ["data", "result", "run", "analysis"]) {
    const nested = result[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return getRunId(nested as Record<string, unknown>);
    }
  }

  throw new Error("An analysis stage did not return its required run identifier.");
}

async function requestJson(url: string, options?: RequestInit) {
  let response: Response;

  try {
    response = await fetch(`${API}${url}`, {
      cache: "no-store",
      ...options,
    });
  } catch {
    throw new Error("Cannot connect to CYTOGENIX backend. Check Terminal 1.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : data.detail
          ? JSON.stringify(data.detail)
          : JSON.stringify(data);

    throw new Error(
      `Request failed (${response.status}): ${detail || "No error details returned."}`
    );
  }

  return data;
}

function getStageImages(name: string, result: Record<string, unknown>) {
  const candidates: { label: string; key: string }[] = [];

  if (name === "Tissue Segmentation") {
    candidates.push(
      { label: "Tissue mask", key: "mask_url" },
      { label: "Segmentation overlay", key: "overlay_url" },
    );
  }

  if (name === "Cellular Intelligence") {
    candidates.push(
      { label: "Cell detection mask", key: "mask_url" },
      { label: "Cell detection overlay", key: "overlay_url" },
    );
  }

  if (name === "Spatial Analysis") {
    candidates.push(
      { label: "Spatial distribution overlay", key: "overlay_url" },
      { label: "Spatial density map", key: "density_url" },
    );
  }

  if (name === "Tumour Microenvironment") {
    candidates.push(
      { label: "Microenvironment overlay", key: "overlay_url" },
      { label: "Tissue compartments", key: "compartments_url" },
      { label: "Immune-like candidate mask", key: "immune_mask_url" },
    );
  }

  return candidates.flatMap(({ label, key }) => {
    const url = imageUrl(result[key]);
    return url ? [{ label, url }] : [];
  });
}

function metricEntries(result: Record<string, unknown>) {
  const payload =
    result.results && typeof result.results === "object"
      ? result.results as Record<string, unknown>
      : result;

  const groups: { title: string; values: [string, number][] }[] = [];

  function addGroup(title: string, value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;

    const values = Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) =>
        typeof item === "number" &&
        Number.isFinite(item) &&
        !/(^id$|_id$|width|height|pixels$|centroid|coordinate|timestamp)/i.test(key)
      ) as [string, number][];

    if (values.length) groups.push({ title, values });
  }

  const priority = [
    ["metrics", "Image quality measurements"],
    ["summary", "Nuclear measurements"],
    ["spatial_summary", "Spatial measurements"],
  ] as const;

  for (const [key, title] of priority) addGroup(title, payload[key]);

  const direct = Object.entries(payload)
    .filter(([key, value]) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      !/(^id$|_id$|width|height|pixels$|centroid|coordinate|timestamp)/i.test(key)
    ) as [string, number][];

  if (direct.length) groups.unshift({ title: "Key measurements", values: direct });

  if (!groups.length) {
    for (const [key, value] of Object.entries(payload)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        addGroup(humanize(key), value);
      }
    }
  }

  return groups;
}

function formatMetric(key: string, value: number) {
  const label = humanize(key);
  const suffix = /percent/i.test(key) ? "%" :
    /circularity/i.test(key) ? "" :
    /density/i.test(key) ? "" : "";
  return {
    label,
    value: Number(value.toFixed(3)).toLocaleString("en-IN") + suffix,
  };
}

function StageCard({ stage, index }: { stage: Stage; index: number }) {
  const groups = metricEntries(stage.result);

  return (
    <article className={styles.panel} style={{ marginTop: 22 }}>
      <div className={styles.sectionLabel}>
        {String(index + 1).padStart(2, "0")} / {stage.name.toUpperCase()}
      </div>
      <h2>{stage.name}</h2>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "7px 12px", borderRadius: 30,
        background: "rgba(36,160,112,.13)", color: "#35b98b",
        fontSize: 12, fontWeight: 700, marginBottom: 18,
      }}>
        <span>●</span> ANALYSIS COMPLETED
      </div>

      {groups.map((group) => (
        <div key={group.title} style={{ marginBottom: 22 }}>
          <h3 style={{ marginBottom: 12 }}>{group.title}</h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
            gap: 12,
          }}>
            {group.values.map(([key, value]) => {
              const metric = formatMetric(key, value);
              return (
                <div key={key} style={{
                  padding: 16, borderRadius: 12,
                  background: "rgba(128,145,165,.09)",
                  border: "1px solid rgba(128,145,165,.17)",
                  minWidth: 0,
                }}>
                  <div style={{ fontSize: 12, opacity: .7, marginBottom: 9 }}>
                    {metric.label}
                  </div>
                  <div style={{
                    fontSize: 23, fontWeight: 700,
                    overflowWrap: "anywhere",
                  }}>
                    {metric.value}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {stage.images.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <h3 style={{ marginBottom: 14 }}>Visual analysis</h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}>
            {stage.images.map((item) => (
              <div key={item.url} style={{
                borderRadius: 13, overflow: "hidden",
                border: "1px solid rgba(128,145,165,.2)",
                background: "rgba(128,145,165,.06)",
              }}>
                <div style={{ padding: "12px 14px", fontWeight: 650, fontSize: 13 }}>
                  {item.label}
                </div>
                <img
                  src={item.url}
                  alt={item.label}
                  style={{
                    display: "block", width: "100%",
                    height: 260, objectFit: "contain",
                    background: "#101820",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 && stage.images.length === 0 && (
        <p style={{ opacity: .7 }}>
          The analysis completed, but this response did not include displayable
          measurements or visual files.
        </p>
      )}

      <details style={{ marginTop: 18, opacity: .7 }}>
        <summary style={{ cursor: "pointer", fontSize: 13 }}>
          Research method and limitations
        </summary>
        <p style={{ fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
          This module uses experimental image-processing methods. Its candidate
          regions and measurements are not verified biological cells or a
          clinically validated diagnosis.
        </p>
      </details>
    </article>
  );
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
      setNotice("Image saved and reference comparison completed.");
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
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

    async function run(
      name: string,
      endpoint: string,
      body?: Record<string, number>
    ) {
      setProgress(`Running ${name}…`);

      const options: RequestInit = { method: "POST" };

      if (body) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(body);
      }

      const result = await requestJson(endpoint, options);

      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error(`${name} returned an unexpected result.`);
      }

      const record = result as Record<string, unknown>;
      completed.push({
        name,
        result: record,
        images: getStageImages(name, record),
      });
      setStages([...completed]);
      return record;
    }

    try {
      await run(
        "Image Quality & Processing",
        `/image-processing/images/${uploadedId}/analyze`
      );

      await run(
        "Tissue Segmentation",
        `/segmentation/images/${uploadedId}/run`,
        {
          saturation_threshold: 20,
          brightness_threshold: 245,
          minimum_region_area: 100,
          morphology_kernel: 5,
        }
      );

      const cellular = await run(
        "Cellular Intelligence",
        `/cellular-intelligence/images/${uploadedId}/run`,
        {
          saturation_threshold: 35,
          darkness_threshold: 225,
          minimum_nucleus_area: 20,
          maximum_nucleus_area: 5000,
          morphology_kernel: 3,
        }
      );

      const cellularRunId = getRunId(cellular);

      const morphometry = await run(
        "Nuclear Morphometry",
        `/nuclear-morphometry/cellular-runs/${cellularRunId}/analyze`
      );

      const morphometryRunId = getRunId(morphometry);

      await run(
        "Spatial Analysis",
        `/spatial-analysis/morphometry-runs/${morphometryRunId}/analyze`,
        {
          grid_rows: 6,
          grid_columns: 6,
          cluster_epsilon_pixels: 45,
          minimum_cluster_points: 4,
        }
      );

      await run(
        "Tumour Microenvironment",
        `/tumour-microenvironment/images/${uploadedId}/run`,
        {
          tissue_saturation_threshold: 12,
          tumour_saturation_threshold: 35,
          immune_saturation_threshold: 35,
          immune_darkness_threshold: 190,
          minimum_region_area: 80,
          maximum_immune_area: 350,
          proximity_distance_pixels: 30,
          morphology_kernel: 3,
        }
      );

      setNotice("All six research analysis stages completed.");
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  const best = comparison?.closest_match;

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>CYTOGENIX / CANCER INTELLIGENCE</div>
          <h1>Cancer Image Comparison & Analysis</h1>
          <p>
            Explore microscope images through experimental tissue and cellular
            image analysis.
          </p>
        </div>
        <span className={styles.status}>EXPERIMENTAL RESEARCH</span>
      </header>

      <section className={styles.notice}>
        <strong>Research use only</strong>
        <p>
          Reference matching shows the closest visual match in the current
          reference library. It does not diagnose cancer. Analysis measurements
          are experimental and not clinically validated.
        </p>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.success}>{notice}</div>}
      {progress && <div className={styles.progress}>{progress}</div>}

      <section className={styles.panel}>
        <div className={styles.sectionLabel}>01 / ORIGINAL MICROSCOPE IMAGE</div>
        <h2>Upload a microscope photograph</h2>
        <p>Choose the original photograph transferred from your iPhone.</p>

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
              <strong>Original specimen image</strong>
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
                  <img className={styles.specimenImage}
                    src={originalImageUrl} alt="Uploaded specimen" />
                </article>
                <article className={styles.imagePanel}>
                  <div className={styles.imageHeading}>
                    <strong>{best.cancer_name}</strong>
                    <span>REFERENCE IMAGE</span>
                  </div>
                  <img className={styles.specimenImage}
                    src={imageUrl(best.image_url) || ""}
                    alt="Closest reference slide" />
                  <p className={styles.muted}>
                    {best.tissue_type || "Tissue not specified"} · {best.stain || "Stain not specified"}
                  </p>
                </article>
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              <h3>No reference images are available</h3>
              <p>Add reference images in the Reference Slide Library first.</p>
            </div>
          )}
          <p className={styles.muted}>
            This is a visual reference comparison, not a diagnosis or cancer probability.
          </p>
        </section>
      )}

      {uploadedId && (
        <section className={styles.panel}>
          <div className={styles.sectionLabel}>03 / INTEGRATED ANALYSIS</div>
          <h2>Complete research analysis</h2>
          <p>Run the six research modules on your saved microscope image.</p>

          <div className={styles.stageList}>
            {STAGE_NAMES.map((name, index) => {
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

          <button className={styles.primary}
            disabled={busy} onClick={() => void runCompleteAnalysis()}>
            {busy ? "Analysis running…" : "Run complete research analysis"}
          </button>
        </section>
      )}

      {stages.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <div className={styles.sectionLabel}>04 / VISUAL RESEARCH FINDINGS</div>
          <h2 style={{ marginBottom: 8 }}>Analysis dashboard</h2>
          <p className={styles.muted}>
            Measurements and generated image outputs from the completed modules.
          </p>
          {stages.map((stage, index) => (
            <StageCard key={stage.name} stage={stage} index={index} />
          ))}
        </section>
      )}

      {stages.length > 0 && uploadedId && (
        <ResearchReportGenerator
          image={{
            id: uploadedId,
            original_name: uploadedName || file?.name || "Microscope image",
            file_format: file?.name.split(".").pop()?.toUpperCase() || "Unknown",
            width: Number(dimensions.split(" × ")[0]) || undefined,
            height: Number(dimensions.split(" × ")[1]?.split(" ")[0]) || undefined,
          }}
          imageUrl={originalImageUrl}
          quality={stages.find((s) => s.name === "Image Quality & Processing")?.result}
          segmentation={stages.find((s) => s.name === "Tissue Segmentation")?.result}
          cellular={stages.find((s) => s.name === "Cellular Intelligence")?.result}
          morphometry={stages.find((s) => s.name === "Nuclear Morphometry")?.result}
          spatial={stages.find((s) => s.name === "Spatial Analysis")?.result}
          microenvironment={stages.find((s) => s.name === "Tumour Microenvironment")?.result}
        />
      )}

      <footer>
        CYTOGENIX · Cancer Cellular & Tissue Intelligence · Experimental research only
      </footer>
    </main>
  );
}
