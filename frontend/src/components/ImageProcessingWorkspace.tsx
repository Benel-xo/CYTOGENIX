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

type Metrics = {
  source_dimensions: { width: number; height: number };
  analysis_dimensions: { width: number; height: number };
  brightness_mean_0_255: number;
  grayscale_contrast_std_0_255: number;
  laplacian_variance_blur_indicator: number;
  approximate_tissue_coverage_percent: number;
  mean_rgb: { red: number; green: number; blue: number };
  mean_hsv_saturation_0_255: number;
  analysis_method: string;
  limitations: string[];
};

type AnalysisResult = {
  report_id: string;
  image_id: string;
  filename: string;
  created_at: string;
  metrics: Metrics;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

function MetricCard({ label, value, detail }: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="processing-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export default function ImageProcessingWorkspace() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadImages() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/microscopy/images`);
      if (!response.ok) throw new Error("Could not load the microscopy repository.");
      const data = await response.json();
      setImages(data.images || []);
      if (data.images?.length && !selectedId) {
        setSelectedId(data.images[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to the API.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadImages();
  }, []);

  async function runAnalysis() {
    if (!selectedId) return;

    setAnalysing(true);
    setError("");
    setMessage("");
    setResult(null);

    try {
      const response = await fetch(
        `${API}/image-processing/images/${selectedId}/analyze`,
        { method: "POST" }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Image analysis failed.");
      }

      setResult(data);
      setMessage("Image-quality measurements completed and saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected analysis error.");
    } finally {
      setAnalysing(false);
    }
  }

  const selectedImage = images.find((image) => image.id === selectedId);

  return (
    <div className="processing-page">
      <div className="processing-heading">
        <div>
          <div className="eyebrow">RESEARCH WORKSPACE / IMAGE ANALYTICS</div>
          <h1>Image Quality &amp; Processing</h1>
          <p>Measure image characteristics before downstream research analysis.</p>
        </div>
        <span className="processing-module-tag">MODULE 03 · v0.1</span>
      </div>

      <div className="processing-notice">
        <strong>Research measurement only</strong>
        <p>These are computational image indicators. They are not clinical quality grades, validated tissue segmentation, stain quantification or diagnostic findings.</p>
      </div>

      <section className="processing-panel">
        <div className="eyebrow">IMAGE SELECTION</div>
        <h2>Select a registered microscopy image</h2>
        <p className="processing-description">Choose an image already uploaded in Digital Microscopy.</p>

        {loading ? (
          <p className="processing-empty">Loading registered images...</p>
        ) : images.length === 0 ? (
          <p className="processing-empty">No registered images. Upload an image in Digital Microscopy first.</p>
        ) : (
          <div className="processing-select-row">
            <select value={selectedId} onChange={(event) => {
              setSelectedId(event.target.value);
              setResult(null);
              setMessage("");
              setError("");
            }}>
              {images.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.original_name} · {image.file_format}
                </option>
              ))}
            </select>
            <button onClick={runAnalysis} disabled={!selectedId || analysing}>
              {analysing ? "Analysing image..." : "Run quality analysis"}
            </button>
          </div>
        )}

        {selectedImage && (
          <div className="processing-file-info">
            <span>SELECTED FILE</span>
            <strong>{selectedImage.original_name}</strong>
            <small>
              {selectedImage.width ?? "?"} × {selectedImage.height ?? "?"} px
              {" · "}{selectedImage.file_format}
              {" · "}{(selectedImage.size_bytes / (1024 * 1024)).toFixed(2)} MB
            </small>
          </div>
        )}

        {message && <div className="processing-success">{message}</div>}
        {error && <div className="processing-error">{error}</div>}
      </section>

      {result && (
        <>
          <section className="processing-panel">
            <div className="processing-result-heading">
              <div>
                <div className="eyebrow">ANALYSIS OUTPUT</div>
                <h2>Image-quality measurements</h2>
                <p className="processing-description">{result.filename}</p>
              </div>
              <span className="processing-saved">REPORT SAVED</span>
            </div>

            <div className="processing-metrics-grid">
              <MetricCard
                label="BRIGHTNESS MEAN"
                value={`${result.metrics.brightness_mean_0_255}`}
                detail="Grayscale intensity · 0–255"
              />
              <MetricCard
                label="CONTRAST"
                value={`${result.metrics.grayscale_contrast_std_0_255}`}
                detail="Grayscale standard deviation"
              />
              <MetricCard
                label="BLUR INDICATOR"
                value={`${result.metrics.laplacian_variance_blur_indicator}`}
                detail="Laplacian variance · higher often means more edges"
              />
              <MetricCard
                label="APPROX. TISSUE COVERAGE"
                value={`${result.metrics.approximate_tissue_coverage_percent}%`}
                detail="Colour-threshold estimate"
              />
            </div>
          </section>

          <section className="processing-panel">
            <div className="eyebrow">COLOUR CHARACTERISTICS</div>
            <h2>Mean channel measurements</h2>
            <div className="processing-colours">
              <div><span className="channel-dot red-dot" /> Red <strong>{result.metrics.mean_rgb.red}</strong></div>
              <div><span className="channel-dot green-dot" /> Green <strong>{result.metrics.mean_rgb.green}</strong></div>
              <div><span className="channel-dot blue-dot" /> Blue <strong>{result.metrics.mean_rgb.blue}</strong></div>
              <div><span className="channel-dot purple-dot" /> HSV saturation <strong>{result.metrics.mean_hsv_saturation_0_255}</strong></div>
            </div>
            <div className="processing-dimensions">
              <div><span>Original dimensions</span><strong>{result.metrics.source_dimensions.width} × {result.metrics.source_dimensions.height}</strong></div>
              <div><span>Analysis thumbnail</span><strong>{result.metrics.analysis_dimensions.width} × {result.metrics.analysis_dimensions.height}</strong></div>
            </div>
          </section>

          <section className="processing-panel">
            <div className="eyebrow">PROVENANCE &amp; LIMITATIONS</div>
            <h2>Measurement notes</h2>
            <p className="processing-method">{result.metrics.analysis_method}</p>
            <ul className="processing-limitations">
              {result.metrics.limitations.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
            <div className="processing-report-id">Report ID: {result.report_id}</div>
          </section>
        </>
      )}

      <div className="processing-footer">
        CYTOGENIX · Computational measurements for experimental biomedical research.
      </div>
    </div>
  );
}
