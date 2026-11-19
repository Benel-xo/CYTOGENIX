
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./TumourMicroenvironmentWorkspace.module.css";

const API = "http://127.0.0.1:8000/api/v1";

type MicroscopyImage = {
  id: string;
  original_name: string;
  file_format?: string;
  size_bytes?: number;
  width?: number | null;
  height?: number | null;
};

type Parameters = {
  tissue_saturation_threshold: number;
  tumour_saturation_threshold: number;
  immune_saturation_threshold: number;
  immune_darkness_threshold: number;
  minimum_region_area: number;
  maximum_immune_area: number;
  proximity_distance_pixels: number;
  morphology_kernel: number;
};

type Candidate = {
  candidate_number: number;
  area_pixels: number;
  centroid_x: number;
  centroid_y: number;
  distance_to_tumour_pixels: number | null;
  spatial_group: string;
  bounding_box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type Results = {
  source_dimensions?: {
    width: number;
    height: number;
  };
  analysis_dimensions?: {
    width: number;
    height: number;
  };
  tissue_area_pixels?: number;
  candidate_tumour_area_pixels?: number;
  candidate_stroma_area_pixels?: number;
  candidate_tumour_area_percent_of_tissue?: number;
  candidate_stroma_area_percent_of_tissue?: number;
  immune_like_candidate_count?: number;
  immune_like_candidates_near_tumour?: number;
  immune_like_candidates_far_from_tumour?: number;
  candidate_density_per_10000_tissue_pixels?: number;
  spatial_grid?: {
    row: number;
    column: number;
    candidate_count: number;
  }[];
  candidates?: Candidate[];
  method?: string;
  limitations?: string[];
};

type Run = {
  run_id: string;
  image_id?: string;
  filename?: string;
  created_at?: string;
  results?: Results;
  overlay_url?: string;
  compartments_url?: string;
  immune_mask_url?: string;
  csv_url?: string;
};

const DEFAULTS: Parameters = {
  tissue_saturation_threshold: 12,
  tumour_saturation_threshold: 35,
  immune_saturation_threshold: 35,
  immune_darkness_threshold: 190,
  minimum_region_area: 80,
  maximum_immune_area: 350,
  proximity_distance_pixels: 30,
  morphology_kernel: 3,
};

function assetUrl(path?: string) {
  if (!path) return "";

  return path.startsWith("http")
    ? path
    : `${API.replace("/api/v1", "")}${path}`;
}

function number(value?: number | null, digits = 2) {
  return value === undefined || value === null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString(undefined, {
        maximumFractionDigits: digits,
      });
}

function date(value?: string) {
  if (!value) return "Date unavailable";

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString();
}

function bytes(value?: number) {
  if (!value) return "—";

  return value < 1048576
    ? `${(value / 1024).toFixed(1)} KB`
    : `${(value / 1048576).toFixed(2)} MB`;
}

export default function TumourMicroenvironmentWorkspace() {
  const [images, setImages] = useState<MicroscopyImage[]>([]);
  const [imageId, setImageId] = useState("");
  const [parameters, setParameters] = useState<Parameters>(DEFAULTS);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedImage = useMemo(
    () => images.find((image) => String(image.id) === imageId),
    [images, imageId]
  );

  const results = run?.results;

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/microscopy/images`);

      if (!response.ok) {
        throw new Error(
          `Image list request failed (${response.status}).`
        );
      }

      const data = await response.json();

      const list: MicroscopyImage[] = Array.isArray(data)
        ? data
        : data.images ?? data.items ?? [];

      setImages(list);

      setImageId((old) =>
        old && list.some((item) => String(item.id) === old)
          ? old
          : list.length
            ? String(list[0].id)
            : ""
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to CYTOGENIX API."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (selectedId: string) => {
    if (!selectedId) {
      setHistory([]);
      return;
    }

    try {
      const response = await fetch(
        `${API}/tumour-microenvironment/images/${selectedId}/runs`
      );

      if (!response.ok) {
        throw new Error("History request failed.");
      }

      const data = await response.json();

      setHistory(data.runs ?? []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  useEffect(() => {
    setRun(null);
    setNotice("");
    void loadHistory(imageId);
  }, [imageId, loadHistory]);

  function update<K extends keyof Parameters>(
    key: K,
    value: number
  ) {
    setParameters((old) => ({
      ...old,
      [key]: value,
    }));
  }

  async function analyse() {
    if (!imageId) {
      setError("Select an uploaded microscopy image first.");
      return;
    }

    if (
      parameters.maximum_immune_area <
      parameters.minimum_region_area
    ) {
      setError(
        "Maximum immune-candidate area must be at least the minimum region area."
      );
      return;
    }

    setRunning(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API}/tumour-microenvironment/images/${imageId}/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(parameters),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail ?? response.status)
        );
      }

      setRun(data);

      setNotice(
        "Experimental analysis completed and saved to the database."
      );

      await loadHistory(imageId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Analysis failed."
      );
    } finally {
      setRunning(false);
    }
  }

  async function viewHistory(item: Run) {
    try {
      const response = await fetch(
        `${API}/tumour-microenvironment/runs/${item.run_id}`
      );

      if (!response.ok) {
        throw new Error("Could not load saved run.");
      }

      setRun(await response.json());

      setNotice("Showing a previously saved analysis.");
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load saved run."
      );
    }
  }

  const metrics = [
    [
      "Candidate tumour-like area",
      `${number(results?.candidate_tumour_area_percent_of_tissue)}%`,
      "Share of detected tissue area",
    ],
    [
      "Candidate stroma-like area",
      `${number(results?.candidate_stroma_area_percent_of_tissue)}%`,
      "Share of detected tissue area",
    ],
    [
      "Immune-like candidates",
      number(results?.immune_like_candidate_count, 0),
      "Heuristic image regions",
    ],
    [
      "Near candidate tumour",
      number(results?.immune_like_candidates_near_tumour, 0),
      "Centroid distance threshold",
    ],
    [
      "Far from candidate tumour",
      number(results?.immune_like_candidates_far_from_tumour, 0),
      "Centroid distance threshold",
    ],
    [
      "Candidate density",
      number(results?.candidate_density_per_10000_tissue_pixels, 3),
      "Per 10,000 tissue pixels",
    ],
  ];

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            WORKSPACE 08 / SPATIAL TISSUE CONTEXT
          </div>

          <h1>Tumour Microenvironment</h1>

          <p>
            Experimental compartment colour analysis and spatial
            summaries of immune-like candidate regions.
          </p>
        </div>

        <span className={styles.status}>RESEARCH MODE</span>
      </header>

      <section className={styles.disclaimer}>
        <strong>Experimental research notice</strong>

        <p>
          Colour-based candidate compartments and immune-like
          regions are not verified tumour, stromal or immune-cell
          annotations. This is not trained AI and is not clinically
          validated.
        </p>
      </section>

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      {notice && (
        <div className={styles.notice}>{notice}</div>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <span className={styles.tag}>01 / INPUT</span>

            <h2>Choose microscopy image</h2>

            <p>
              Images are loaded from Digital Microscopy.
            </p>
          </div>

          <button
            className={styles.secondary}
            onClick={() => void loadImages()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh images"}
          </button>
        </div>

        {loading ? (
          <p className={styles.empty}>
            Loading image library…
          </p>
        ) : images.length === 0 ? (
          <p className={styles.empty}>
            No images found. Upload one in Digital Microscopy first.
          </p>
        ) : (
          <>
            <label
              className={styles.label}
              htmlFor="tme-image"
            >
              Registered image
            </label>

            <select
              id="tme-image"
              className={styles.select}
              value={imageId}
              onChange={(event) =>
                setImageId(event.target.value)
              }
            >
              {images.map((image) => (
                <option
                  key={image.id}
                  value={String(image.id)}
                >
                  {image.original_name} · {image.id}
                </option>
              ))}
            </select>

            {selectedImage && (
              <div className={styles.imageInfo}>
                <span>
                  <small>FILE</small>
                  <b>{selectedImage.original_name}</b>
                </span>

                <span>
                  <small>FORMAT</small>
                  <b>{selectedImage.file_format ?? "—"}</b>
                </span>

                <span>
                  <small>SIZE</small>
                  <b>{bytes(selectedImage.size_bytes)}</b>
                </span>

                <span>
                  <small>DIMENSIONS</small>
                  <b>
                    {selectedImage.width && selectedImage.height
                      ? `${selectedImage.width} × ${selectedImage.height} px`
                      : "—"}
                  </b>
                </span>
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <span className={styles.tag}>02 / PARAMETERS</span>

            <h2>Colour and spatial thresholds</h2>

            <p>
              Adjust the experimental heuristics. Thresholds are
              not biological ground truth.
            </p>
          </div>

          <button
            className={styles.textButton}
            onClick={() => {
              setParameters(DEFAULTS);
              setRun(null);
            }}
          >
            Reset
          </button>
        </div>

        <div className={styles.parameters}>
          {([
            [
              "tissue_saturation_threshold",
              "Tissue saturation threshold",
              0,
              255,
              1,
            ],
            [
              "tumour_saturation_threshold",
              "Tumour-like saturation threshold",
              0,
              255,
              1,
            ],
            [
              "immune_saturation_threshold",
              "Immune-like saturation threshold",
              0,
              255,
              1,
            ],
            [
              "immune_darkness_threshold",
              "Immune-like darkness threshold",
              0,
              255,
              1,
            ],
            [
              "minimum_region_area",
              "Minimum candidate area (px²)",
              1,
              1000,
              1,
            ],
            [
              "maximum_immune_area",
              "Maximum immune-like area (px²)",
              10,
              5000,
              10,
            ],
            [
              "proximity_distance_pixels",
              "Tumour proximity distance (px)",
              1,
              200,
              1,
            ],
            [
              "morphology_kernel",
              "Morphology kernel",
              1,
              15,
              2,
            ],
          ] as const).map(
            ([key, label, min, max, step]) => (
              <label
                className={styles.parameter}
                key={key}
              >
                <span>
                  {label}
                  <b>{parameters[key]}</b>
                </span>

                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={parameters[key]}
                  onChange={(event) =>
                    update(key, Number(event.target.value))
                  }
                />
              </label>
            )
          )}
        </div>

        <div className={styles.runBar}>
          <span>
            {selectedImage
              ? `Selected: ${selectedImage.original_name}`
              : "Select an image to continue"}
          </span>

          <button
            className={styles.primary}
            onClick={() => void analyse()}
            disabled={!imageId || running || loading}
          >
            {running
              ? "Analysing…"
              : "Run microenvironment analysis"}
          </button>
        </div>
      </section>

      {run && results && (
        <>
          <section className={styles.resultsHeading}>
            <div>
              <span className={styles.tag}>03 / RESULTS</span>

              <h2>Microenvironment analysis</h2>

              <p>
                Run {run.run_id} · {date(run.created_at)}
              </p>
            </div>

            {run.csv_url && (
              <a
                className={styles.secondary}
                href={assetUrl(run.csv_url)}
              >
                Export candidates CSV ↓
              </a>
            )}
          </section>

          <section className={styles.metrics}>
            {metrics.map(([label, value, detail]) => (
              <article
                className={styles.metric}
                key={label}
              >
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{detail}</small>
              </article>
            ))}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span className={styles.tag}>
                  04 / VISUAL ANALYSIS
                </span>

                <h2>Image overlays and masks</h2>

                <p>
                  Colour legend: pink = tumour-like candidate,
                  blue = stroma-like candidate, cyan = immune-like
                  candidate.
                </p>
              </div>
            </div>

            <div className={styles.visuals}>
              {([
                ["Combined overlay", run.overlay_url],
                ["Compartment map", run.compartments_url],
                ["Immune-like candidate mask", run.immune_mask_url],
              ] as const).map(([label, url]) => (
                <article
                  className={styles.visual}
                  key={label}
                >
                  <h3>{label}</h3>

                  {url ? (
                    <a
                      href={assetUrl(url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={assetUrl(url)}
                        alt={label}
                      />
                    </a>
                  ) : (
                    <div className={styles.empty}>
                      Image unavailable
                    </div>
                  )}

                  {url && (
                    <a
                      className={styles.download}
                      href={assetUrl(url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open full image ↗
                    </a>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span className={styles.tag}>
                  05 / SPATIAL DISTRIBUTION
                </span>

                <h2>Candidate distribution grid</h2>

                <p>
                  Counts by equal-sized image tile; not a tissue
                  compartment annotation.
                </p>
              </div>
            </div>

            <div className={styles.grid}>
              {(results.spatial_grid ?? []).map((tile) => (
                <div
                  className={styles.gridTile}
                  key={`${tile.row}-${tile.column}`}
                >
                  <small>
                    {tile.row}:{tile.column}
                  </small>

                  <strong>{tile.candidate_count}</strong>
                </div>
              ))}
            </div>

            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Area (px²)</th>
                    <th>Centroid</th>
                    <th>Distance (px)</th>
                    <th>Spatial group</th>
                  </tr>
                </thead>

                <tbody>
                  {(results.candidates ?? [])
                    .slice(0, 100)
                    .map((item) => (
                      <tr key={item.candidate_number}>
                        <td>{item.candidate_number}</td>

                        <td>
                          {number(item.area_pixels, 0)}
                        </td>

                        <td>
                          {number(item.centroid_x, 1)},{" "}
                          {number(item.centroid_y, 1)}
                        </td>

                        <td>
                          {number(
                            item.distance_to_tumour_pixels,
                            1
                          )}
                        </td>

                        <td>{item.spatial_group}</td>
                      </tr>
                    ))}
                </tbody>
              </table>

              {(results.candidates ?? []).length > 100 && (
                <p className={styles.note}>
                  Showing first 100 of{" "}
                  {results.candidates?.length} candidate
                  regions. Export CSV for the complete list.
                </p>
              )}

              {(results.candidates ?? []).length === 0 && (
                <p className={styles.empty}>
                  No candidate regions detected with these
                  parameters.
                </p>
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span className={styles.tag}>06 / METHOD</span>

                <h2>
                  Scientific interpretation and limitations
                </h2>
              </div>
            </div>

            <p className={styles.method}>
              {results.method}
            </p>

            <ul className={styles.limitations}>
              {(results.limitations ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <span className={styles.tag}>07 / DATABASE</span>

            <h2>Saved analysis history</h2>

            <p>
              Previous analysis runs for the selected image.
            </p>
          </div>
        </div>

        {!imageId ? (
          <p className={styles.empty}>
            Select an image to view its history.
          </p>
        ) : history.length === 0 ? (
          <p className={styles.empty}>
            No saved runs for this image yet.
          </p>
        ) : (
          <div className={styles.history}>
            {history.map((item) => (
              <div
                className={styles.historyItem}
                key={item.run_id}
              >
                <span>
                  <b>{item.run_id}</b>

                  <small>
                    {date(item.created_at)} ·{" "}
                    {number(
                      item.results?.immune_like_candidate_count,
                      0
                    )}{" "}
                    immune-like candidates
                  </small>
                </span>

                <button
                  className={styles.secondary}
                  onClick={() => void viewHistory(item)}
                >
                  View run
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        CYTOGENIX · Tumour Microenvironment · Experimental
        research workspace
      </footer>
    </main>
  );
}
