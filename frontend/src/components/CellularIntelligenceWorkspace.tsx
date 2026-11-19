
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./CellularIntelligenceWorkspace.module.css";

const API = "http://127.0.0.1:8000/api/v1";

type MicroscopyImage = {
  id: number;
  original_name: string;
  file_format?: string;
  size_bytes?: number;
  width?: number | null;
  height?: number | null;
};

type Parameters = {
  saturation_threshold: number;
  darkness_threshold: number;
  minimum_nucleus_area: number;
  maximum_nucleus_area: number;
  morphology_kernel: number;
};

type Nucleus = {
  nucleus_number: number;
  area_pixels: number;
  perimeter_pixels: number;
  circularity: number;
  bounding_box: { x: number; y: number; width: number; height: number };
  centroid: { x: number; y: number };
};

type AnalysisResults = {
  source_dimensions?: { width: number; height: number };
  analysis_dimensions?: { width: number; height: number };
  total_analysis_pixels?: number;
  detected_nuclei_count?: number;
  nuclei_density_per_10000_pixels?: number;
  nuclei_area_pixels?: number;
  mean_nucleus_area_pixels?: number;
  median_nucleus_area_pixels?: number;
  minimum_nucleus_area_pixels?: number;
  maximum_nucleus_area_pixels?: number;
  mean_perimeter_pixels?: number;
  mean_circularity?: number;
  nuclei?: Nucleus[];
  method?: string;
  limitations?: string[];
};

type AnalysisRun = {
  run_id: string | number;
  image_id?: number;
  original_name?: string;
  created_at?: string;
  parameters?: Parameters;
  results?: AnalysisResults;
  mask_url?: string;
  overlay_url?: string;
};

const DEFAULT_PARAMETERS: Parameters = {
  saturation_threshold: 35,
  darkness_threshold: 225,
  minimum_nucleus_area: 20,
  maximum_nucleus_area: 5000,
  morphology_kernel: 3,
};

function formatNumber(value?: number, digits = 2) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function formatDate(value?: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatBytes(bytes?: number) {
  if (!bytes) return "Size unavailable";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function imageUrl(path?: string) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API.replace("/api/v1", "")}${path}`;
}

export default function CellularIntelligenceWorkspace() {
  const [images, setImages] = useState<MicroscopyImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState("");
  const [parameters, setParameters] =
    useState<Parameters>(DEFAULT_PARAMETERS);
  const [currentRun, setCurrentRun] = useState<AnalysisRun | null>(null);
  const [history, setHistory] = useState<AnalysisRun[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [running, setRunning] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedImage = useMemo(
    () => images.find((image) => String(image.id) === selectedImageId),
    [images, selectedImageId]
  );

  const results = currentRun?.results;

  const loadImages = useCallback(async () => {
    setLoadingImages(true);
    setError("");

    try {
      const response = await fetch(`${API}/microscopy/images`);
      if (!response.ok) {
        throw new Error(`Could not load microscopy images (${response.status}).`);
      }

      const data = await response.json();
      const list: MicroscopyImage[] = Array.isArray(data)
        ? data
        : data.images ?? data.items ?? [];

      setImages(list);
      setSelectedImageId((previous) => {
        if (previous && list.some((image) => String(image.id) === previous)) {
          return previous;
        }
        return list.length ? String(list[0].id) : "";
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the CYTOGENIX API."
      );
    } finally {
      setLoadingImages(false);
    }
  }, []);

  const loadHistory = useCallback(async (imageId: string) => {
    if (!imageId) {
      setHistory([]);
      return;
    }

    setLoadingHistory(true);
    try {
      const response = await fetch(
        `${API}/cellular-intelligence/images/${imageId}/runs`
      );
      if (!response.ok) {
        throw new Error("Could not load analysis history.");
      }

      const data = await response.json();
      const list: AnalysisRun[] = Array.isArray(data)
        ? data
        : data.runs ?? data.history ?? [];

      setHistory(list);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  useEffect(() => {
    setCurrentRun(null);
    setNotice("");
    if (selectedImageId) {
      void loadHistory(selectedImageId);
    } else {
      setHistory([]);
    }
  }, [selectedImageId, loadHistory]);

  function updateParameter<K extends keyof Parameters>(
    key: K,
    value: number
  ) {
    setParameters((previous) => ({ ...previous, [key]: value }));
  }

  async function runAnalysis() {
    if (!selectedImageId) {
      setError("Select a microscopy image before starting the analysis.");
      return;
    }

    if (parameters.maximum_nucleus_area < parameters.minimum_nucleus_area) {
      setError("Maximum candidate area must be greater than or equal to minimum area.");
      return;
    }

    setRunning(true);
    setError("");
    setNotice("");
    setCurrentRun(null);

    try {
      const response = await fetch(
        `${API}/cellular-intelligence/images/${selectedImageId}/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parameters),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail
            ? typeof data.detail === "string"
              ? data.detail
              : JSON.stringify(data.detail)
            : `Analysis failed (${response.status}).`
        );
      }

      setCurrentRun(data);
      setNotice("Analysis completed. Results are displayed below.");
      await loadHistory(selectedImageId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The analysis could not be completed."
      );
    } finally {
      setRunning(false);
    }
  }

  function resetParameters() {
    setParameters(DEFAULT_PARAMETERS);
    setCurrentRun(null);
    setNotice("Analysis parameters have been reset.");
    setError("");
  }

  function showHistoryRun(run: AnalysisRun) {
    setCurrentRun(run);
    setNotice("Showing a previously saved analysis.");
    setError("");
  }

  const metricCards = [
    {
      label: "Candidate nuclei detected",
      value: formatNumber(results?.detected_nuclei_count, 0),
      detail: "Heuristic image regions",
    },
    {
      label: "Mean candidate area",
      value: formatNumber(results?.mean_nucleus_area_pixels),
      detail: "Pixels²",
    },
    {
      label: "Mean circularity",
      value: formatNumber(results?.mean_circularity, 3),
      detail: "Shape descriptor",
    },
    {
      label: "Density",
      value: formatNumber(results?.nuclei_density_per_10000_pixels),
      detail: "Candidates per 10,000 pixels",
    },
  ];

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>WORKSPACE 06 / CELLULAR ANALYSIS</div>
          <h1>Cellular Intelligence</h1>
          <p>
            Explore candidate nuclear regions and quantitative image
            measurements from uploaded microscopy images.
          </p>
        </div>
        <div className={styles.status}>
          <span className={styles.statusDot} />
          Research mode
        </div>
      </header>

      <section className={styles.disclaimer}>
        <strong>Research-use notice</strong>
        <span>
          This workspace uses heuristic image processing, not a trained or
          clinically validated cell detector. Detected regions are candidate
          objects and must not be interpreted as confirmed cells or used for
          diagnosis.
        </span>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.sectionTag}>01 / INPUT</span>
            <h2>Select microscopy image</h2>
            <p>Choose an image already uploaded in Digital Microscopy.</p>
          </div>
          <button
            className={styles.secondaryButton}
            onClick={() => void loadImages()}
            disabled={loadingImages}
          >
            {loadingImages ? "Refreshing…" : "Refresh images"}
          </button>
        </div>

        {loadingImages ? (
          <div className={styles.emptyState}>Loading uploaded images…</div>
        ) : images.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No microscopy images found</h3>
            <p>
              Upload an image in the Digital Microscopy workspace, then return
              here to analyse it.
            </p>
          </div>
        ) : (
          <>
            <label className={styles.fieldLabel} htmlFor="cellular-image">
              Available image
            </label>
            <select
              id="cellular-image"
              className={styles.select}
              value={selectedImageId}
              onChange={(event) => setSelectedImageId(event.target.value)}
            >
              {images.map((image) => (
                <option key={image.id} value={String(image.id)}>
                  {image.original_name} — ID {image.id}
                </option>
              ))}
            </select>

            {selectedImage && (
              <div className={styles.imageInfo}>
                <div>
                  <span className={styles.infoLabel}>FILE NAME</span>
                  <strong>{selectedImage.original_name}</strong>
                </div>
                <div>
                  <span className={styles.infoLabel}>FORMAT</span>
                  <strong>{selectedImage.file_format ?? "—"}</strong>
                </div>
                <div>
                  <span className={styles.infoLabel}>FILE SIZE</span>
                  <strong>{formatBytes(selectedImage.size_bytes)}</strong>
                </div>
                <div>
                  <span className={styles.infoLabel}>DIMENSIONS</span>
                  <strong>
                    {selectedImage.width && selectedImage.height
                      ? `${selectedImage.width} × ${selectedImage.height} px`
                      : "Not available"}
                  </strong>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.sectionTag}>02 / CONFIGURATION</span>
            <h2>Detection parameters</h2>
            <p>
              Adjust the heuristic thresholds. These values affect candidate
              region detection and are not biological ground truth.
            </p>
          </div>
          <button className={styles.textButton} onClick={resetParameters}>
            Reset parameters
          </button>
        </div>

        <div className={styles.parameterGrid}>
          <label className={styles.parameter}>
            <span>Saturation threshold</span>
            <strong>{parameters.saturation_threshold}</strong>
            <input
              type="range"
              min="0"
              max="255"
              value={parameters.saturation_threshold}
              onChange={(event) =>
                updateParameter("saturation_threshold", Number(event.target.value))
              }
            />
            <small>Colour saturation sensitivity</small>
          </label>

          <label className={styles.parameter}>
            <span>Darkness threshold</span>
            <strong>{parameters.darkness_threshold}</strong>
            <input
              type="range"
              min="0"
              max="255"
              value={parameters.darkness_threshold}
              onChange={(event) =>
                updateParameter("darkness_threshold", Number(event.target.value))
              }
            />
            <small>Brightness cutoff for candidate regions</small>
          </label>

          <label className={styles.parameter}>
            <span>Minimum candidate area</span>
            <strong>{parameters.minimum_nucleus_area} px²</strong>
            <input
              type="range"
              min="1"
              max="1000"
              value={parameters.minimum_nucleus_area}
              onChange={(event) =>
                updateParameter("minimum_nucleus_area", Number(event.target.value))
              }
            />
            <small>Small regions below this value are excluded</small>
          </label>

          <label className={styles.parameter}>
            <span>Maximum candidate area</span>
            <strong>{parameters.maximum_nucleus_area} px²</strong>
            <input
              type="range"
              min="100"
              max="20000"
              step="100"
              value={parameters.maximum_nucleus_area}
              onChange={(event) =>
                updateParameter("maximum_nucleus_area", Number(event.target.value))
              }
            />
            <small>Large regions above this value are excluded</small>
          </label>

          <label className={styles.parameter}>
            <span>Morphology kernel</span>
            <strong>{parameters.morphology_kernel}</strong>
            <input
              type="range"
              min="1"
              max="15"
              step="2"
              value={parameters.morphology_kernel}
              onChange={(event) =>
                updateParameter("morphology_kernel", Number(event.target.value))
              }
            />
            <small>Noise cleanup kernel size</small>
          </label>
        </div>

        <div className={styles.runBar}>
          <div>
            <strong>Ready to analyse</strong>
            <span>
              {selectedImage
                ? `Selected: ${selectedImage.original_name}`
                : "Select an image to continue"}
            </span>
          </div>
          <button
            className={styles.primaryButton}
            onClick={() => void runAnalysis()}
            disabled={!selectedImageId || running || loadingImages}
          >
            {running ? "Analysing image…" : "Run cellular analysis"}
          </button>
        </div>
      </section>

      {currentRun && results && (
        <>
          <section className={styles.resultsHeader}>
            <div>
              <span className={styles.sectionTag}>03 / ANALYSIS OUTPUT</span>
              <h2>Cellular analysis results</h2>
              <p>
                Run ID: {currentRun.run_id} · {formatDate(currentRun.created_at)}
              </p>
            </div>
            <span className={styles.resultBadge}>Analysis saved</span>
          </section>

          <section className={styles.metricsGrid}>
            {metricCards.map((metric) => (
              <article className={styles.metricCard} key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.sectionTag}>04 / VISUAL OUTPUT</span>
                <h2>Segmentation visualisation</h2>
                <p>
                  Compare the generated candidate-region overlay and binary
                  mask.
                </p>
              </div>
            </div>

            <div className={styles.visualGrid}>
              <div className={styles.visualCard}>
                <div className={styles.visualTitle}>Candidate overlay</div>
                {currentRun.overlay_url ? (
                  <a
                    href={imageUrl(currentRun.overlay_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl(currentRun.overlay_url)}
                      alt="Candidate nuclear region overlay"
                    />
                  </a>
                ) : (
                  <div className={styles.visualEmpty}>Overlay unavailable</div>
                )}
                {currentRun.overlay_url && (
                  <a
                    className={styles.downloadLink}
                    href={imageUrl(currentRun.overlay_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open overlay image ↗
                  </a>
                )}
              </div>

              <div className={styles.visualCard}>
                <div className={styles.visualTitle}>Binary candidate mask</div>
                {currentRun.mask_url ? (
                  <a
                    href={imageUrl(currentRun.mask_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl(currentRun.mask_url)}
                      alt="Binary candidate region mask"
                    />
                  </a>
                ) : (
                  <div className={styles.visualEmpty}>Mask unavailable</div>
                )}
                {currentRun.mask_url && (
                  <a
                    className={styles.downloadLink}
                    href={imageUrl(currentRun.mask_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open mask image ↗
                  </a>
                )}
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.sectionTag}>05 / MORPHOMETRY</span>
                <h2>Candidate region measurements</h2>
                <p>
                  Measurements are computed on the analysis image in pixels.
                  They are not calibrated physical measurements.
                </p>
              </div>
            </div>

            <div className={styles.measurementSummary}>
              <div>
                <span>Median area</span>
                <strong>{formatNumber(results.median_nucleus_area_pixels)} px²</strong>
              </div>
              <div>
                <span>Area range</span>
                <strong>
                  {formatNumber(results.minimum_nucleus_area_pixels, 0)}–{formatNumber(results.maximum_nucleus_area_pixels, 0)} px²
                </strong>
              </div>
              <div>
                <span>Mean perimeter</span>
                <strong>{formatNumber(results.mean_perimeter_pixels)} px</strong>
              </div>
              <div>
                <span>Analysis dimensions</span>
                <strong>
                  {results.analysis_dimensions
                    ? `${results.analysis_dimensions.width} × ${results.analysis_dimensions.height} px`
                    : "—"}
                </strong>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.measurementTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Area (px²)</th>
                    <th>Perimeter (px)</th>
                    <th>Circularity</th>
                    <th>Centroid (x, y)</th>
                    <th>Bounding box (w × h)</th>
                  </tr>
                </thead>
                <tbody>
                  {(results.nuclei ?? []).slice(0, 100).map((nucleus) => (
                    <tr key={nucleus.nucleus_number}>
                      <td>{nucleus.nucleus_number}</td>
                      <td>{formatNumber(nucleus.area_pixels, 0)}</td>
                      <td>{formatNumber(nucleus.perimeter_pixels)}</td>
                      <td>{formatNumber(nucleus.circularity, 3)}</td>
                      <td>
                        {formatNumber(nucleus.centroid?.x, 0)},{" "}
                        {formatNumber(nucleus.centroid?.y, 0)}
                      </td>
                      <td>
                        {nucleus.bounding_box?.width} ×{" "}
                        {nucleus.bounding_box?.height}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(results.nuclei ?? []).length > 100 && (
                <p className={styles.tableNote}>
                  Showing the first 100 of {results.nuclei?.length} candidate
                  regions in this table.
                </p>
              )}
              {(results.nuclei ?? []).length === 0 && (
                <div className={styles.emptyState}>
                  No candidate regions were detected using these parameters.
                  Try adjusting the thresholds.
                </div>
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.sectionTag}>06 / METHOD & LIMITATIONS</span>
                <h2>Scientific interpretation</h2>
              </div>
            </div>
            <div className={styles.methodBox}>
              <strong>Method</strong>
              <p>
                {results.method ??
                  "Heuristic colour-thresholding, morphology and connected-component analysis."}
              </p>
            </div>
            <ul className={styles.limitations}>
              {(results.limitations ?? []).map((limitation, index) => (
                <li key={`${index}-${limitation}`}>{limitation}</li>
              ))}
              <li>
                This output is experimental and is not suitable for clinical
                diagnosis or patient-management decisions.
              </li>
            </ul>
          </section>
        </>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.sectionTag}>07 / RECORDS</span>
            <h2>Analysis history</h2>
            <p>Previously saved runs for the currently selected image.</p>
          </div>
          {loadingHistory && <span className={styles.muted}>Loading…</span>}
        </div>

        {!selectedImageId ? (
          <div className={styles.emptyState}>Select an image to view its history.</div>
        ) : history.length === 0 ? (
          <div className={styles.emptyState}>
            No saved analyses are available for this image yet.
          </div>
        ) : (
          <div className={styles.historyList}>
            {history.map((run) => (
              <div className={styles.historyItem} key={run.run_id}>
                <div>
                  <strong>Run #{run.run_id}</strong>
                  <span>{formatDate(run.created_at)}</span>
                  <small>
                    {formatNumber(run.results?.detected_nuclei_count, 0)} candidate regions
                  </small>
                </div>
                <button
                  className={styles.secondaryButton}
                  onClick={() => showHistoryRun(run)}
                >
                  View results
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        CYTOGENIX · Cellular Intelligence · Experimental research workspace
      </footer>
    </main>
  );
}
