
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./NuclearMorphometryWorkspace.module.css";

const API = "http://127.0.0.1:8000/api/v1";

type MicroscopyImage = {
  id: string;
  original_name: string;
  file_format: string;
  width: number | null;
  height: number | null;
};

type CellularRun = {
  run_id: string;
  created_at: string;
  results: {
    detected_nuclei_count?: number;
  };
};

type Measurement = {
  region_number: number;
  area_pixels: number;
  perimeter_pixels: number;
  major_axis_pixels: number;
  minor_axis_pixels: number;
  aspect_ratio: number | null;
  eccentricity: number;
  equivalent_diameter_pixels: number;
  circularity: number;
  shape_irregularity: number;
  centroid_x: number;
  centroid_y: number;
};

type MetricSummary = {
  mean: number | null;
  median: number | null;
  minimum: number | null;
  maximum: number | null;
  standard_deviation: number | null;
};

type MorphometryResults = {
  source: {
    cellular_run_id: string;
    image_id: string;
    filename: string;
    analysis_width_pixels: number;
    analysis_height_pixels: number;
  };
  region_count: number;
  summary: Record<string, MetricSummary | number | null>;
  area_distribution: {
    range_start: number;
    range_end: number;
    count: number;
  }[];
  measurements: Measurement[];
  method: string;
  limitations: string[];
};

type MorphometryRun = {
  run_id: string;
  cellular_run_id?: string;
  image_id?: string;
  created_at: string;
  results: MorphometryResults;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatMetric(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(digits);
}

function getMetric(
  summary: MorphometryResults["summary"],
  key: string
): MetricSummary | null {
  const value = summary[key];

  if (typeof value === "object" && value !== null && "mean" in value) {
    return value as MetricSummary;
  }

  return null;
}

const visualPanelStyle: React.CSSProperties = {
  background: "#111b29",
  border: "1px solid #29394d",
  borderRadius: "13px",
  padding: "18px",
  minWidth: 0,
};

const visualImageStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  maxHeight: "420px",
  objectFit: "contain",
  background: "#080e18",
  borderRadius: "8px",
  border: "1px solid #29394d",
};

export default function NuclearMorphometryWorkspace() {
  const [images, setImages] = useState<MicroscopyImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState("");
  const [cellularRuns, setCellularRuns] = useState<CellularRun[]>([]);
  const [selectedCellularRunId, setSelectedCellularRunId] = useState("");
  const [history, setHistory] = useState<MorphometryRun[]>([]);
  const [activeRun, setActiveRun] = useState<MorphometryRun | null>(null);

  const [loadingImages, setLoadingImages] = useState(true);
  const [loadingCellularRuns, setLoadingCellularRuns] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState("");

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId),
    [images, selectedImageId]
  );

  const loadImages = useCallback(async () => {
    setLoadingImages(true);
    setError("");

    try {
      const response = await fetch(`${API}/microscopy/images`);

      if (!response.ok) {
        throw new Error("Could not load registered microscopy images.");
      }

      const data = await response.json();
      const items: MicroscopyImage[] = Array.isArray(data)
        ? data
        : data.images ?? [];

      setImages(items);

      if (items.length > 0) {
        setSelectedImageId((current) => current || items[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load microscopy images."
      );
    } finally {
      setLoadingImages(false);
    }
  }, []);

  const loadCellularRuns = useCallback(async (imageId: string) => {
    if (!imageId) {
      setCellularRuns([]);
      setSelectedCellularRunId("");
      return;
    }

    setLoadingCellularRuns(true);
    setError("");
    setCellularRuns([]);
    setSelectedCellularRunId("");
    setHistory([]);
    setActiveRun(null);

    try {
      const response = await fetch(
        `${API}/cellular-intelligence/images/${imageId}/runs`
      );

      if (!response.ok) {
        throw new Error("Could not load Cellular Intelligence history.");
      }

      const data = await response.json();
      const runs: CellularRun[] = data.runs ?? [];

      setCellularRuns(runs);

      if (runs.length > 0) {
        setSelectedCellularRunId(runs[0].run_id);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load Cellular Intelligence history."
      );
    } finally {
      setLoadingCellularRuns(false);
    }
  }, []);

  const loadMorphometryHistory = useCallback(
    async (cellularRunId: string) => {
      if (!cellularRunId) {
        setHistory([]);
        setActiveRun(null);
        return;
      }

      setLoadingHistory(true);
      setError("");
      setHistory([]);
      setActiveRun(null);

      try {
        const response = await fetch(
          `${API}/nuclear-morphometry/cellular-runs/${cellularRunId}/history`
        );

        if (!response.ok) {
          throw new Error("Could not load morphometry history.");
        }

        const data = await response.json();
        const runs: MorphometryRun[] = data.runs ?? [];

        setHistory(runs);

        if (runs.length > 0) {
          setActiveRun({
            ...runs[0],
            cellular_run_id: cellularRunId,
          });
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load morphometry history."
        );
      } finally {
        setLoadingHistory(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  useEffect(() => {
    if (selectedImageId) {
      void loadCellularRuns(selectedImageId);
    }
  }, [selectedImageId, loadCellularRuns]);

  useEffect(() => {
    if (selectedCellularRunId) {
      void loadMorphometryHistory(selectedCellularRunId);
    }
  }, [selectedCellularRunId, loadMorphometryHistory]);

  async function runAnalysis() {
    if (!selectedCellularRunId) {
      setError("Select a Cellular Intelligence analysis run first.");
      return;
    }

    setAnalysing(true);
    setError("");

    try {
      const response = await fetch(
        `${API}/nuclear-morphometry/cellular-runs/${selectedCellularRunId}/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ?? "Nuclear Morphometry analysis failed."
        );
      }

      const newRun: MorphometryRun = {
        ...data,
        results: data.results,
        cellular_run_id: selectedCellularRunId,
      };

      setActiveRun(newRun);
      setHistory((current) => [
        newRun,
        ...current.filter((item) => item.run_id !== newRun.run_id),
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nuclear Morphometry analysis failed."
      );
    } finally {
      setAnalysing(false);
    }
  }

  async function openHistoryRun(runId: string) {
    setError("");

    try {
      const response = await fetch(
        `${API}/nuclear-morphometry/runs/${runId}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? "Could not open this analysis.");
      }

      setActiveRun(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not open analysis."
      );
    }
  }

  const results = activeRun?.results;
  const summary = results?.summary;
  const areaDistribution = results?.area_distribution ?? [];

  const maxDistributionCount = Math.max(
    1,
    ...areaDistribution.map((item) => item.count)
  );

  const areaSummary = summary
    ? getMetric(summary, "area_pixels")
    : null;

  const eccentricitySummary = summary
    ? getMetric(summary, "eccentricity")
    : null;

  const circularitySummary = summary
    ? getMetric(summary, "circularity")
    : null;

  const aspectSummary = summary
    ? getMetric(summary, "aspect_ratio")
    : null;

  const coefficientOfVariation = summary
    ? summary.area_coefficient_of_variation_percent
    : null;

  const originalImageUrl = selectedImageId
    ? `${API}/microscopy/images/${selectedImageId}/file`
    : "";

  const cellularMaskUrl = selectedCellularRunId
    ? `${API}/cellular-intelligence/runs/${selectedCellularRunId}/mask`
    : "";

  const cellularOverlayUrl = selectedCellularRunId
    ? `${API}/cellular-intelligence/runs/${selectedCellularRunId}/overlay`
    : "";

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>MODULE 07 / CELLULAR ANALYTICS</div>
          <h1>Nuclear Morphometry</h1>
          <p>
            Quantitative geometric analysis of candidate nuclear regions
            derived from Cellular Intelligence.
          </p>
        </div>

        <div className={styles.status}>
          <span className={styles.statusDot} />
          RESEARCH MODE
        </div>
      </header>

      <section className={styles.notice}>
        <strong>Research-use notice</strong>
        <span>
          Measurements are computed from heuristic candidate regions. They
          are not verified nuclei, diagnostic biomarkers or clinically
          validated measurements.
        </span>
      </section>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionNumber}>01</span>
            <h2>Analysis source</h2>
          </div>
          <span className={styles.muted}>Select an existing analysis</span>
        </div>

        <div className={styles.sourceGrid}>
          <label className={styles.field}>
            <span>Microscopy image</span>
            <select
              value={selectedImageId}
              onChange={(event) => setSelectedImageId(event.target.value)}
              disabled={loadingImages || images.length === 0}
            >
              {images.length === 0 && (
                <option value="">No registered images</option>
              )}
              {images.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.original_name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Cellular Intelligence run</span>
            <select
              value={selectedCellularRunId}
              onChange={(event) =>
                setSelectedCellularRunId(event.target.value)
              }
              disabled={
                loadingCellularRuns || cellularRuns.length === 0
              }
            >
              {cellularRuns.length === 0 && (
                <option value="">No cellular analysis runs</option>
              )}
              {cellularRuns.map((run) => (
                <option key={run.run_id} value={run.run_id}>
                  {formatDate(run.created_at)} ·{" "}
                  {run.results.detected_nuclei_count ?? 0} candidates
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.sourceFooter}>
          <div className={styles.sourceInfo}>
            {selectedImage ? (
              <>
                <span className={styles.sourceLabel}>SELECTED IMAGE</span>
                <strong>{selectedImage.original_name}</strong>
                <span>
                  {selectedImage.width ?? "—"} ×{" "}
                  {selectedImage.height ?? "—"} px
                </span>
              </>
            ) : (
              <span>
                {loadingImages
                  ? "Loading registered images…"
                  : "Upload an image in Digital Microscopy first."}
              </span>
            )}
          </div>

          <button
            className={styles.primaryButton}
            onClick={runAnalysis}
            disabled={
              analysing ||
              !selectedCellularRunId ||
              loadingCellularRuns
            }
          >
            {analysing ? "ANALYSING…" : "RUN MORPHOMETRY"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>

        {cellularRuns.length === 0 && !loadingCellularRuns && (
          <p className={styles.helperText}>
            No Cellular Intelligence runs were found for this image. Open
            Module 06 and run an analysis before continuing.
          </p>
        )}
      </section>

      {loadingHistory && (
        <div className={styles.loading}>Loading analysis history…</div>
      )}

      {results && (
        <>
          {/* VISUAL ANALYSIS */}
          <section style={{ marginTop: "24px" }}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionNumber}>02</span>
                <h2>Microscopy visual analysis</h2>
              </div>
              <span className={styles.muted}>Source and segmentation views</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
                marginTop: "16px",
              }}
            >
              <article style={visualPanelStyle}>
                <h3 style={{ margin: "0 0 12px", color: "#e2e8f0" }}>
                  Original microscopy image
                </h3>
                <img
                  src={originalImageUrl}
                  alt="Original uploaded microscopy image"
                  style={visualImageStyle}
                />
                <p style={{ color: "#91a4b8", fontSize: "12px" }}>
                  {selectedImage?.original_name ?? "Source image"}
                </p>
              </article>

              <article style={visualPanelStyle}>
                <h3 style={{ margin: "0 0 12px", color: "#e2e8f0" }}>
                  Cellular candidate mask
                </h3>
                <img
                  src={cellularMaskUrl}
                  alt="Binary mask from Cellular Intelligence"
                  style={visualImageStyle}
                />
                <p style={{ color: "#91a4b8", fontSize: "12px" }}>
                  White pixels represent detected candidate regions.
                </p>
              </article>

              <article style={visualPanelStyle}>
                <h3 style={{ margin: "0 0 12px", color: "#e2e8f0" }}>
                  Cellular detection overlay
                </h3>
                <img
                  src={cellularOverlayUrl}
                  alt="Cellular Intelligence detection overlay"
                  style={visualImageStyle}
                />
                <p style={{ color: "#91a4b8", fontSize: "12px" }}>
                  Overlay generated by the upstream Cellular Intelligence run.
                </p>
              </article>
            </div>

            <p
              style={{
                color: "#91a4b8",
                fontSize: "12px",
                marginTop: "12px",
              }}
            >
              These visualizations show the original image and upstream
              Cellular Intelligence outputs. They are not independently
              verified nuclear annotations.
            </p>
          </section>

          <section className={styles.metricsGrid}>
            <article className={styles.metricCard}>
              <span>Candidate regions</span>
              <strong>{results.region_count.toLocaleString()}</strong>
              <small>Connected components in source mask</small>
            </article>

            <article className={styles.metricCard}>
              <span>Mean region area</span>
              <strong>{formatMetric(areaSummary?.mean)}</strong>
              <small>Pixels²</small>
            </article>

            <article className={styles.metricCard}>
              <span>Mean eccentricity</span>
              <strong>{formatMetric(eccentricitySummary?.mean, 4)}</strong>
              <small>Estimated shape elongation</small>
            </article>

            <article className={styles.metricCard}>
              <span>Area variation</span>
              <strong>
                {formatMetric(
                  typeof coefficientOfVariation === "number"
                    ? coefficientOfVariation
                    : null
                )}
                {typeof coefficientOfVariation === "number" ? "%" : ""}
              </strong>
              <small>Area coefficient of variation</small>
            </article>
          </section>

          <section className={styles.analysisGrid}>
            <article className={styles.panel}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.sectionNumber}>03</span>
                  <h2>Area distribution</h2>
                </div>
              </div>

              {areaDistribution.length > 0 ? (
                <div className={styles.chart}>
                  {areaDistribution.map((bin, index) => (
                    <div className={styles.chartRow} key={index}>
                      <span className={styles.chartRange}>
                        {Math.round(bin.range_start)}–
                        {Math.round(bin.range_end)}
                      </span>
                      <div className={styles.chartTrack}>
                        <div
                          className={styles.chartBar}
                          style={{
                            width: `${
                              (bin.count / maxDistributionCount) * 100
                            }%`,
                          }}
                        />
                      </div>
                      <strong>{bin.count}</strong>
                    </div>
                  ))}
                  <div className={styles.chartCaption}>
                    Area ranges in analysis-thumbnail pixels²
                  </div>
                </div>
              ) : (
                <p className={styles.emptyText}>
                  No candidate regions are available for this distribution.
                </p>
              )}
            </article>

            <article className={styles.panel}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.sectionNumber}>04</span>
                  <h2>Shape profile</h2>
                </div>
              </div>

              <div className={styles.profileList}>
                <div>
                  <span>Mean circularity</span>
                  <strong>{formatMetric(circularitySummary?.mean, 4)}</strong>
                </div>
                <div>
                  <span>Mean aspect ratio</span>
                  <strong>{formatMetric(aspectSummary?.mean, 4)}</strong>
                </div>
                <div>
                  <span>Mean eccentricity</span>
                  <strong>{formatMetric(eccentricitySummary?.mean, 4)}</strong>
                </div>
                <div>
                  <span>Mean area</span>
                  <strong>{formatMetric(areaSummary?.mean)}</strong>
                </div>
                <div>
                  <span>Median area</span>
                  <strong>{formatMetric(areaSummary?.median)}</strong>
                </div>
                <div>
                  <span>Area standard deviation</span>
                  <strong>
                    {formatMetric(areaSummary?.standard_deviation)}
                  </strong>
                </div>
              </div>
            </article>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionNumber}>05</span>
                <h2>Region measurements</h2>
              </div>
              <a
                className={styles.exportButton}
                href={`${API}/nuclear-morphometry/runs/${activeRun.run_id}/export.csv`}
                target="_blank"
                rel="noreferrer"
              >
                EXPORT CSV ↓
              </a>
            </div>

            <p className={styles.tableIntro}>
              {results.measurements.length.toLocaleString()} measured
              candidate regions · values are in image pixels unless stated
              otherwise.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.measurementTable}>
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Area (px²)</th>
                    <th>Perimeter (px)</th>
                    <th>Major axis</th>
                    <th>Minor axis</th>
                    <th>Aspect ratio</th>
                    <th>Eccentricity</th>
                    <th>Circularity</th>
                    <th>Irregularity</th>
                  </tr>
                </thead>
                <tbody>
                  {results.measurements.map((item) => (
                    <tr key={item.region_number}>
                      <td>R-{String(item.region_number).padStart(4, "0")}</td>
                      <td>{item.area_pixels}</td>
                      <td>{formatMetric(item.perimeter_pixels)}</td>
                      <td>{formatMetric(item.major_axis_pixels)}</td>
                      <td>{formatMetric(item.minor_axis_pixels)}</td>
                      <td>{formatMetric(item.aspect_ratio, 4)}</td>
                      <td>{formatMetric(item.eccentricity, 4)}</td>
                      <td>{formatMetric(item.circularity, 4)}</td>
                      <td>{formatMetric(item.shape_irregularity, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {results.measurements.length === 0 && (
                <div className={styles.emptyText}>
                  No candidate regions were present in this source mask.
                </div>
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionNumber}>06</span>
                <h2>Method and limitations</h2>
              </div>
            </div>

            <p className={styles.methodText}>{results.method}</p>

            <ul className={styles.limitations}>
              {results.limitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionNumber}>07</span>
            <h2>Analysis history</h2>
          </div>
          <span className={styles.muted}>
            {history.length} saved run{history.length === 1 ? "" : "s"}
          </span>
        </div>

        {history.length === 0 ? (
          <p className={styles.emptyText}>
            {loadingHistory
              ? "Retrieving saved runs…"
              : "No morphometry runs saved for this Cellular Intelligence analysis."}
          </p>
        ) : (
          <div className={styles.historyList}>
            {history.map((run) => (
              <button
                key={run.run_id}
                className={`${styles.historyItem} ${
                  activeRun?.run_id === run.run_id
                    ? styles.historyItemActive
                    : ""
                }`}
                onClick={() => openHistoryRun(run.run_id)}
              >
                <span>
                  <strong>{formatDate(run.created_at)}</strong>
                  <small>
                    {run.results.region_count} candidate regions
                  </small>
                </span>
                <span className={styles.historyArrow}>→</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        CYTOGENIX · NUCLEAR MORPHOMETRY · EXPERIMENTAL RESEARCH WORKSPACE
      </footer>
    </main>
  );
}
