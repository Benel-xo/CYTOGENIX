"use client";

import { useCallback, useEffect, useState } from "react";

type MicroscopyImage = {
  id: string;
  original_name: string;
  file_format: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function MicroscopyWorkspace() {
  const [images, setImages] = useState<MicroscopyImage[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadImages = useCallback(async () => {
    try {
      const response = await fetch(`${API}/microscopy/images`);
      if (!response.ok) throw new Error("Could not retrieve image records.");
      const data = await response.json();
      setImages(data.images);
    } catch {
      setError("Cannot connect to the microscopy API. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  async function uploadImage() {
    if (!selectedFile) return;

    setUploading(true);
    setMessage("");
    setError("");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(`${API}/microscopy/images`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Image upload failed.");
      }

      setMessage(`Successfully registered ${result.filename}.`);
      setSelectedFile(null);
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected upload error.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="microscopy-page">
      <div className="microscopy-heading">
        <div>
          <div className="eyebrow">IMAGE ACQUISITION / INSPECTION</div>
          <h1>Digital Microscopy</h1>
          <p>Import, organise and inspect digital pathology image files.</p>
        </div>
        <div className="microscopy-version">MODULE 02 · IMAGE INGESTION</div>
      </div>

      <div className="microscopy-stats">
        <div className="microscopy-stat">
          <span>REGISTERED IMAGES</span>
          <strong>{images.length}</strong>
        </div>
        <div className="microscopy-stat">
          <span>SUPPORTED FORMATS</span>
          <strong>06</strong>
        </div>
        <div className="microscopy-stat">
          <span>STORAGE</span>
          <strong>LOCAL</strong>
        </div>
        <div className="microscopy-stat">
          <span>UPLOAD LIMIT</span>
          <strong>2 GB</strong>
        </div>
      </div>

      <section className="microscopy-panel">
        <div className="microscopy-panel-heading">
          <div>
            <div className="eyebrow">DATA INGESTION</div>
            <h2>Import a microscopy image</h2>
            <p>Choose a supported pathology image from your computer.</p>
          </div>
          <span className="upload-symbol">↑</span>
        </div>

        <label className="upload-dropzone">
          <input
            type="file"
            accept=".svs,.tif,.tiff,.png,.jpg,.jpeg"
            onChange={(event) => {
              setError("");
              setMessage("");
              setSelectedFile(event.target.files?.[0] || null);
            }}
          />
          <span className="upload-cloud">⇧</span>
          <strong>{selectedFile ? selectedFile.name : "Choose an image to upload"}</strong>
          <span>Click to browse files · SVS, TIFF, PNG, JPEG</span>
          <span className="upload-limit">Maximum file size: 2 GB</span>
        </label>

        {selectedFile && (
          <div className="selected-file">
            <div className="selected-file-info">
              <strong>{selectedFile.name}</strong>
              <span>{formatBytes(selectedFile.size)} · {selectedFile.type || "Image file"}</span>
            </div>
            <button
              className="upload-button"
              onClick={uploadImage}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "Upload and register"}
            </button>
          </div>
        )}

        {previewUrl && selectedFile && selectedFile.type.startsWith("image/") && (
          <div className="image-preview">
            <div className="preview-label">LOCAL FILE PREVIEW</div>
            {selectedFile.type.includes("jpeg") || selectedFile.type.includes("png") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Selected microscopy preview" />
            ) : (
              <p>Preview is not available for this format in the browser. The file will still be validated by the backend.</p>
            )}
          </div>
        )}

        {message && <div className="upload-message success-message">{message}</div>}
        {error && <div className="upload-message error-message">{error}</div>}
      </section>

      <section className="microscopy-panel">
        <div className="microscopy-panel-heading">
          <div>
            <div className="eyebrow">LOCAL IMAGE REPOSITORY</div>
            <h2>Registered images</h2>
            <p>Files stored in your CYTOGENIX project directory.</p>
          </div>
          <button className="refresh-button" onClick={loadImages}>↻ Refresh</button>
        </div>

        {loading ? (
          <div className="repository-empty">Loading image records...</div>
        ) : images.length === 0 ? (
          <div className="repository-empty">
            <span className="empty-icon">▧</span>
            <strong>No images registered yet</strong>
            <p>Upload your first microscopy image to begin building your local repository.</p>
          </div>
        ) : (
          <div className="image-table-wrap">
            <table className="image-table">
              <thead>
                <tr>
                  <th>IMAGE FILE</th>
                  <th>FORMAT</th>
                  <th>DIMENSIONS</th>
                  <th>FILE SIZE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {images.map((image) => (
                  <tr key={image.id}>
                    <td><strong>{image.original_name}</strong><small>{image.id.slice(0, 8)}</small></td>
                    <td>{image.file_format}</td>
                    <td>{image.width && image.height ? `${image.width} × ${image.height}` : "Not available"}</td>
                    <td>{formatBytes(image.size_bytes)}</td>
                    <td><span className="registered-tag">REGISTERED</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="microscopy-notice">
        <strong>Research data handling</strong>
        <p>Uploaded files are stored locally and metadata is recorded in PostgreSQL. Use authorised, de-identified research images only. Uploading an image does not perform diagnosis, classification or clinical interpretation.</p>
      </div>
    </div>
  );
}
