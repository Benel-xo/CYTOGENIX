"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

type MicroscopyImage = {
  id: string;
  original_name: string;
  file_format: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
};

type ReferenceSlide = {
  id: string;
  cancer_id: string;
  cancer_name: string;
  slot: number;
  original_name: string;
  width?: number | null;
  height?: number | null;
  size_bytes?: number;
  tissue_type?: string | null;
  stain?: string | null;
  source_url?: string | null;
  license?: string | null;
  notes?: string | null;
};

const panel: React.CSSProperties = {
  background: "var(--panel, #ffffff)",
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 14,
  padding: 22,
};

const muted: React.CSSProperties = {
  color: "var(--muted, #64748b)",
  fontSize: 13,
};

const primaryButton: React.CSSProperties = {
  border: 0,
  borderRadius: 9,
  padding: "11px 16px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid var(--border, #d1d5db)",
  borderRadius: 9,
  padding: "10px 14px",
  background: "transparent",
  color: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function MicroscopyWorkspace() {
  const [images, setImages] = useState<MicroscopyImage[]>([]);
  const [slides, setSlides] = useState<ReferenceSlide[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [selectedImageId, setSelectedImageId] = useState("");
  const [selectedSlideId, setSelectedSlideId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const computerInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const selectedImage = images.find((image) => image.id === selectedImageId);
  const selectedSlide = slides.find((slide) => slide.id === selectedSlideId);

  const filteredSlides = useMemo(() => {
    if (categoryFilter === "all") return slides;
    return slides.filter((slide) => slide.cancer_id === categoryFilter);
  }, [slides, categoryFilter]);

  const categories = useMemo(() => {
    const unique = new Map<string, string>();
    slides.forEach((slide) => {
      unique.set(slide.cancer_id, slide.cancer_name || slide.cancer_id);
    });
    return Array.from(unique.entries()).sort((a, b) =>
      a[1].localeCompare(b[1])
    );
  }, [slides]);

  const loadImages = useCallback(async () => {
    const response = await fetch(`${API}/microscopy/images`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not load the microscopy repository.");
    const data = await response.json();
    setImages(Array.isArray(data.images) ? data.images : []);
  }, []);

  const loadSlides = useCallback(async () => {
    const response = await fetch(`${API}/reference-slides/slides`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not load the Reference Slide Library.");
    const data = await response.json();
    setSlides(Array.isArray(data.slides) ? data.slides : []);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadImages(), loadSlides()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load workspace data.");
    } finally {
      setLoading(false);
    }
  }, [loadImages, loadSlides]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  function chooseFile(file: File | null) {
    setError("");
    setMessage("");

    if (!file) return;

    const allowed = [".svs", ".tif", ".tiff", ".png", ".jpg", ".jpeg"];
    const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;

    if (!allowed.includes(extension)) {
      setError("Unsupported file. Choose an SVS, TIFF, PNG or JPEG image.");
      return;
    }

    setSelectedFile(file);
  }

  async function uploadImage() {
    if (!selectedFile) {
      setError("Choose or capture an image first.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API}/microscopy/images`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Image upload failed.");
      }

      await loadImages();
      setSelectedImageId(data.id);
      setMessage(
        `Image registered successfully: ${data.filename || selectedFile.name}`
      );
      setSelectedFile(null);

      if (computerInputRef.current) computerInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function imageFileUrl(id: string) {
    return `${API}/microscopy/images/${id}/file`;
  }

  function referenceFileUrl(id: string) {
    return `${API}/reference-slides/slides/${id}/file`;
  }

  const imageStyle: React.CSSProperties = {
    width: "100%",
    height: 330,
    objectFit: "contain",
    background: "#101827",
    borderRadius: 10,
    display: "block",
  };

  return (
    <div style={{ display: "grid", gap: 22, width: "100%", maxWidth: 1500 }}>
      <header>
        <div style={{ ...muted, letterSpacing: 1.2, fontWeight: 700 }}>
          CYTOGENIX · DIGITAL PATHOLOGY
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 750, margin: "8px 0" }}>
          Digital Microscopy
        </h1>
        <p style={{ ...muted, fontSize: 14, maxWidth: 780, lineHeight: 1.7 }}>
          Capture microscope images, register them in your image repository,
          and compare them visually with original reference slides.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            padding: 13,
            borderRadius: 9,
            background: "#fef2f2",
            color: "#991b1b",
            border: "1px solid #fecaca",
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          style={{
            padding: 13,
            borderRadius: 9,
            background: "#eff6ff",
            color: "#1e40af",
            border: "1px solid #bfdbfe",
          }}
        >
          {message}
        </div>
      )}

      <section style={panel}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 7px" }}>
          1. Microscope image capture
        </h2>
        <p style={{ ...muted, margin: "0 0 18px", lineHeight: 1.6 }}>
          Use an iPhone camera through the microscope eyepiece, or choose an
          existing image from your computer.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            style={primaryButton}
            onClick={() => cameraInputRef.current?.click()}
          >
            Capture with iPhone camera
          </button>

          <button
            type="button"
            style={secondaryButton}
            onClick={() => computerInputRef.current?.click()}
          >
            Choose image from computer
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={(event) => chooseFile(event.target.files?.[0] || null)}
          style={{ display: "none" }}
        />

        <input
          ref={computerInputRef}
          type="file"
          accept=".svs,.tif,.tiff,.png,.jpg,.jpeg"
          onChange={(event) => chooseFile(event.target.files?.[0] || null)}
          style={{ display: "none" }}
        />

        {selectedFile && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 300px)",
              gap: 18,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 650 }}>{selectedFile.name}</div>
              <p style={muted}>
                {formatBytes(selectedFile.size)} · Ready to register
              </p>
              <button
                type="button"
                style={primaryButton}
                onClick={() => void uploadImage()}
                disabled={uploading}
              >
                {uploading ? "Registering image…" : "Upload to CYTOGENIX"}
              </button>
              <button
                type="button"
                style={{ ...secondaryButton, marginLeft: 8 }}
                onClick={() => {
                  setSelectedFile(null);
                  if (cameraInputRef.current) cameraInputRef.current.value = "";
                  if (computerInputRef.current) computerInputRef.current.value = "";
                }}
              >
                Cancel
              </button>
            </div>

            {previewUrl && selectedFile.type.startsWith("image/") && (
              <img
                src={previewUrl}
                alt="Selected microscope image preview"
                style={{
                  width: "100%",
                  maxHeight: 190,
                  objectFit: "contain",
                  background: "#101827",
                  borderRadius: 9,
                }}
              />
            )}
          </div>
        )}

        <p style={{ ...muted, marginTop: 17 }}>
          Supported repository formats: SVS, TIFF, PNG and JPEG. The iPhone
          capture option requests a JPEG or PNG image.
        </p>
      </section>

      <section style={panel}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 6px" }}>
              2. Registered microscope images
            </h2>
            <p style={muted}>
              Images stored in the CYTOGENIX Digital Microscopy repository.
            </p>
          </div>
          <button
            type="button"
            style={secondaryButton}
            onClick={() => void refreshWorkspace()}
          >
            Refresh repository
          </button>
        </div>

        {loading ? (
          <p style={muted}>Loading repository…</p>
        ) : images.length === 0 ? (
          <p style={muted}>No microscope images have been registered yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {images.map((image) => (
              <button
                type="button"
                key={image.id}
                onClick={() => setSelectedImageId(image.id)}
                style={{
                  textAlign: "left",
                  padding: 13,
                  borderRadius: 9,
                  border:
                    selectedImageId === image.id
                      ? "2px solid #2563eb"
                      : "1px solid var(--border, #e5e7eb)",
                  background:
                    selectedImageId === image.id
                      ? "rgba(37,99,235,0.06)"
                      : "transparent",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 650 }}>{image.original_name}</div>
                <div style={muted}>
                  {image.file_format} · {formatBytes(image.size_bytes)} ·{" "}
                  {image.width || "?"} × {image.height || "?"}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section style={panel}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 7px" }}>
          3. Reference Slide Library
        </h2>
        <p style={{ ...muted, lineHeight: 1.6, marginBottom: 16 }}>
          Select an existing reference slide from the library. Only slides
          actually uploaded to the library will appear here.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <label style={{ display: "grid", gap: 7, fontSize: 13 }}>
            <span style={{ fontWeight: 650 }}>Filter by reference category</span>
            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setSelectedSlideId("");
              }}
              style={{
                padding: 11,
                borderRadius: 8,
                border: "1px solid var(--border, #d1d5db)",
                background: "transparent",
                color: "inherit",
              }}
            >
              <option value="all">All available categories</option>
              {categories.map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 7, fontSize: 13 }}>
            <span style={{ fontWeight: 650 }}>Choose original reference slide</span>
            <select
              value={selectedSlideId}
              onChange={(event) => setSelectedSlideId(event.target.value)}
              style={{
                padding: 11,
                borderRadius: 8,
                border: "1px solid var(--border, #d1d5db)",
                background: "transparent",
                color: "inherit",
              }}
            >
              <option value="">Select an available slide</option>
              {filteredSlides.map((slide) => (
                <option value={slide.id} key={slide.id}>
                  {slide.cancer_name} · Slot {slide.slot} · {slide.original_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {slides.length === 0 ? (
          <p style={muted}>
            The Reference Slide Library currently has no uploaded reference
            images. Upload labelled reference material there before comparing.
          </p>
        ) : filteredSlides.length === 0 ? (
          <p style={muted}>There are no uploaded slides in this category.</p>
        ) : (
          <p style={muted}>
            {filteredSlides.length} reference slide
            {filteredSlides.length === 1 ? "" : "s"} available in this selection.
          </p>
        )}
      </section>

      
    </div>
  );
}
