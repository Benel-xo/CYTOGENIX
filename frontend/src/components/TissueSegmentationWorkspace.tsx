
"use client";

import { useEffect, useState } from "react";

type ImageRecord = {
  id: string;
  original_name: string;
  file_format: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
};

type Parameters = {
  saturation_threshold: number;
  brightness_threshold: number;
  minimum_region_area: number;
  morphology_kernel: number;
};

type Region = {
  region_number: number;
  area_pixels: number;
  bounding_box: { x: number; y: number; width: number; height: number };
  centroid: { x: number; y: number };
};

type Results = {
  source_dimensions: { width: number; height: number };
  analysis_dimensions: { width: number; height: number };
  total_analysis_pixels: number;
  tissue_pixels: number;
  background_pixels: number;
  tissue_coverage_percent: number;
  detected_region_count: number;
  regions: Region[];
  method: string;
  limitations: string[];
};

type SegmentationRun = {
  run_id: string;
  image_id: string;
  filename?: string;
  created_at: string;
  parameters: Parameters;
  results: Results;
  mask_url: string;
  overlay_url: string;
};

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

const DEFAULT_PARAMETERS: Parameters = {
  saturation_threshold: 20,
  brightness_threshold: 245,
  minimum_region_area: 100,
  morphology_kernel: 5
};

export default function TissueSegmentationWorkspace() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [parameters, setParameters] =
    useState<Parameters>(DEFAULT_PARAMETERS);
  const [result, setResult] = useState<SegmentationRun | null>(null);
  const [history, setHistory] = useState<SegmentationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadImages() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/microscopy/images`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not load microscopy images.");
      }

      setImages(data.images || []);

      if (data.images?.length && !selectedId) {
        setSelectedId(data.images[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to the API."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(imageId: string) {
    if (!imageId) {
      setHistory([]);
      return;
    }

    try {
      const response = await fetch(
        `${API}/segmentation/images/${imageId}/runs`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Could not load segmentation history."
        );
      }

      setHistory(data.runs || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load experiment history."
      );
    }
  }

  useEffect(() => {
    loadImages();
  }, []);

  useEffect(() => {
    if (selectedId) {
      setResult(null);
      loadHistory(selectedId);
    }
  }, [selectedId]);

  function updateParameter(key: keyof Parameters, value: number) {
    setParameters((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function runSegmentation() {
    if (!selectedId) return;

    setRunning(true);
    setError("");
    setMessage("");
    setResult(null);

    try {
      const response = await fetch(
        `${API}/segmentation/images/${selectedId}/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(parameters)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Segmentation failed.");
      }

      setResult(data);
      setMessage(
        "Segmentation completed. Experiment saved to the database."
      );

      await loadHistory(selectedId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unexpected segmentation error."
      );
    } finally {
      setRunning(false);
    }
  }

  function imageUrl(path: string) {
    return `${API.replace("/api/v1", "")}${path}`;
  }

  const selectedImage = images.find(
    (image) => image.id === selectedId
  );

  return (
    <div className="segmentation-page">
      <div className="segmentation-heading">
        <div>
          <div className="eyebrow">
            RESEARCH WORKSPACE / COMPUTATIONAL HISTOPATHOLOGY
          </div>
          <h1>Tissue Segmentation</h1>
          <p>
            Separate approximate tissue regions from the image background.
          </p>
        </div>

        <span className="segmentation-module-tag">
          MODULE 05 · v0.1
        </span>
      </div>

      <div className="segmentation-notice">
        <strong>
          Experimental heuristic segmentation — not trained AI
        </strong>
        <p>
          This module uses HSV colour thresholds, morphological processing
          and connected-component analysis. It does not identify cancer,
          classify tissue or provide clinical measurements. Inspect every
          output visually.
        </p>
      </div>

      <section className="segmentation-panel">
        <div className="eyebrow">01 / IMAGE SELECTION</div>
        <h2>Choose a registered microscopy image</h2>
        <p className="segmentation-description">
          Select an image previously uploaded in Digital Microscopy.
        </p>

        {loading ? (
          <p className="segmentation-empty">
            Loading image repository...
          </p>
        ) : images.length === 0 ? (
          <p className="segmentation-empty">
            No images found. Upload an image in Digital Microscopy first.
          </p>
        ) : (
          <div className="segmentation-select-row">
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {images.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.original_name} · {image.file_format}
                </option>
              ))}
            </select>

            <button
              onClick={loadImages}
              className="segmentation-secondary-button"
            >
              Refresh
            </button>
          </div>
        )}

        {selectedImage && (
          <div className="segmentation-file-info">
            <span>SELECTED IMAGE</span>
            <strong>{selectedImage.original_name}</strong>
            <small>
              {selectedImage.width ?? "?"} ×{" "}
              {selectedImage.height ?? "?"} px
              {" · "}
              {selectedImage.file_format}
              {" · "}
              {(selectedImage.size_bytes / (1024 * 1024)).toFixed(2)} MB
            </small>
          </div>
        )}
      </section>

      <section className="segmentation-panel">
        <div className="eyebrow">02 / ALGORITHM PARAMETERS</div>
        <h2>Configure segmentation</h2>
        <p className="segmentation-description">
          Adjust the thresholds and rerun the experiment to compare results.
        </p>

        <div className="segmentation-controls">
          <label>
            <span>
              Saturation threshold{" "}
              <strong>{parameters.saturation_threshold}</strong>
            </span>
            <input
              type="range"
              min="0"
              max="150"
              value={parameters.saturation_threshold}
              onChange={(event) =>
                updateParameter(
                  "saturation_threshold",
                  Number(event.target.value)
                )
              }
            />
            <small>
              Higher values exclude weakly coloured pixels.
            </small>
          </label>

          <label>
            <span>
              Brightness threshold{" "}
              <strong>{parameters.brightness_threshold}</strong>
            </span>
            <input
              type="range"
              min="100"
              max="255"
              value={parameters.brightness_threshold}
              onChange={(event) =>
                updateParameter(
                  "brightness_threshold",
                  Number(event.target.value)
                )
              }
            />
            <small>
              Pixels brighter than this threshold are excluded.
            </small>
          </label>

          <label>
            <span>
              Minimum region area{" "}
              <strong>{parameters.minimum_region_area} px</strong>
            </span>
            <input
              type="range"
              min="1"
              max="5000"
              step="1"
              value={parameters.minimum_region_area}
              onChange={(event) =>
                updateParameter(
                  "minimum_region_area",
                  Number(event.target.value)
                )
              }
            />
            <small>
              Smaller connected regions are discarded.
            </small>
          </label>

          <label>
            <span>
              Morphology kernel{" "}
              <strong>{parameters.morphology_kernel} px</strong>
            </span>
            <input
              type="range"
              min="1"
              max="15"
              step="2"
              value={parameters.morphology_kernel}
              onChange={(event) =>
                updateParameter(
                  "morphology_kernel",
                  Number(event.target.value)
                )
              }
            />
            <small>
              Controls small-gap and noise cleanup.
            </small>
          </label>
        </div>

        <div className="segmentation-action-row">
          <button
            onClick={() => setParameters(DEFAULT_PARAMETERS)}
            className="segmentation-secondary-button"
            disabled={running}
          >
            Reset parameters
          </button>

          <button
            onClick={runSegmentation}
            disabled={!selectedId || running || loading}
            className="segmentation-run-button"
          >
            {running
              ? "Processing image..."
              : "Run tissue segmentation"}
          </button>
        </div>

        {message && (
          <div className="segmentation-success">{message}</div>
        )}

        {error && (
          <div className="segmentation-error">{error}</div>
        )}
      </section>

      {result && (
        <>
          <section className="segmentation-panel">
            <div className="segmentation-result-heading">
              <div>
                <div className="eyebrow">
                  03 / SEGMENTATION OUTPUT
                </div>
                <h2>Computed tissue regions</h2>
                <p className="segmentation-description">
                  {result.filename}
                </p>
              </div>

              <span className="segmentation-saved">
                RUN SAVED
              </span>
            </div>

            <div className="segmentation-stats">
              <div>
                <span>TISSUE COVERAGE</span>
                <strong>
                  {result.results.tissue_coverage_percent}%
                </strong>
              </div>

              <div>
                <span>DETECTED REGIONS</span>
                <strong>
                  {result.results.detected_region_count}
                </strong>
              </div>

              <div>
                <span>TISSUE PIXELS</span>
                <strong>
                  {result.results.tissue_pixels.toLocaleString()}
                </strong>
              </div>

              <div>
                <span>BACKGROUND PIXELS</span>
                <strong>
                  {result.results.background_pixels.toLocaleString()}
                </strong>
              </div>
            </div>

            <div className="segmentation-images">
              <div>
                <span className="segmentation-image-label">
                  TISSUE OVERLAY
                </span>
                <img
                  src={imageUrl(result.overlay_url)}
                  alt="Tissue segmentation overlay"
                />
                <a
                  href={imageUrl(result.overlay_url)}
                  download
                >
                  Download overlay PNG ↗
                </a>
              </div>

              <div>
                <span className="segmentation-image-label">
                  BINARY MASK
                </span>
                <img
                  src={imageUrl(result.mask_url)}
                  alt="Binary tissue segmentation mask"
                />
                <a
                  href={imageUrl(result.mask_url)}
                  download
                >
                  Download mask PNG ↗
                </a>
              </div>
            </div>

            <div className="segmentation-dimensions">
              <div>
                <span>Original image dimensions</span>
                <strong>
                  {result.results.source_dimensions.width} ×{" "}
                  {result.results.source_dimensions.height} px
                </strong>
              </div>

              <div>
                <span>Segmentation analysis dimensions</span>
                <strong>
                  {result.results.analysis_dimensions.width} ×{" "}
                  {result.results.analysis_dimensions.height} px
                </strong>
              </div>
            </div>

            <p className="segmentation-run-id">
              Experiment ID: {result.run_id}
            </p>
          </section>

          <section className="segmentation-panel">
            <div className="eyebrow">
              04 / CONNECTED COMPONENTS
            </div>
            <h2>Detected region measurements</h2>

            {result.results.regions.length === 0 ? (
              <p className="segmentation-empty">
                No regions passed the current minimum-area threshold.
                Try adjusting the parameters.
              </p>
            ) : (
              <div className="segmentation-table-wrap">
                <table className="segmentation-table">
                  <thead>
                    <tr>
                      <th>REGION</th>
                      <th>AREA (PX)</th>
                      <th>BOUNDING BOX</th>
                      <th>CENTROID (X, Y)</th>
                    </tr>
                  </thead>

                  <tbody>
                    {result.results.regions.map((region) => (
                      <tr key={region.region_number}>
                        <td>{region.region_number}</td>
                        <td>
                          {region.area_pixels.toLocaleString()}
                        </td>
                        <td>
                          {region.bounding_box.width} ×{" "}
                          {region.bounding_box.height}
                          {" at "}
                          {region.bounding_box.x},{" "}
                          {region.bounding_box.y}
                        </td>
                        <td>
                          {region.centroid.x},{" "}
                          {region.centroid.y}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="segmentation-panel">
            <div className="eyebrow">
              05 / METHOD &amp; LIMITATIONS
            </div>
            <h2>Research provenance</h2>
            <p className="segmentation-method">
              {result.results.method}
            </p>

            <ul className="segmentation-limitations">
              {result.results.limitations.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="segmentation-panel">
        <div className="eyebrow">
          06 / EXPERIMENT REPOSITORY
        </div>
        <h2>Previous segmentation runs</h2>

        {!selectedId ? (
          <p className="segmentation-empty">
            Select an image to view its experiment history.
          </p>
        ) : history.length === 0 ? (
          <p className="segmentation-empty">
            No saved segmentation runs for this image yet.
          </p>
        ) : (
          <div className="segmentation-history">
            {history.map((run) => (
              <div
                className="segmentation-history-row"
                key={run.run_id}
              >
                <div>
                  <strong>
                    {new Date(run.created_at).toLocaleString()}
                  </strong>

                  <small>
                    Coverage: {run.results.tissue_coverage_percent}% ·
                    {" "}
                    {run.results.detected_region_count} regions ·
                    {" "}
                    Saturation:{" "}
                    {run.parameters.saturation_threshold}
                  </small>

                  <small className="segmentation-history-id">
                    {run.run_id}
                  </small>
                </div>

                <div className="segmentation-history-links">
                  <a
                    href={imageUrl(run.overlay_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Overlay
                  </a>

                  <a
                    href={imageUrl(run.mask_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mask
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="segmentation-footer">
        CYTOGENIX · Experimental computational histopathology research.
      </div>
    </div>
  );
}
