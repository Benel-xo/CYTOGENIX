"use client";

import { useCallback, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const cancers = [
  ["breast", "Breast Cancer"], ["lung", "Lung Cancer"],
  ["colorectal", "Colorectal Cancer"], ["prostate", "Prostate Cancer"],
  ["stomach", "Stomach Cancer"], ["cervical", "Cervical Cancer"],
  ["bladder", "Bladder Cancer"], ["melanoma", "Melanoma"],
  ["kidney", "Kidney Cancer"], ["liver", "Liver Cancer"],
] as const;

type Slide = {
  id: string; cancer_id: string; cancer_name: string; slot: number;
  original_name: string; width: number; height: number; size_bytes: number;
  tissue_type?: string; stain?: string; source_url?: string;
  license?: string; notes?: string; file_url: string;
};

const panel: React.CSSProperties = {
  background: "#111827", border: "1px solid #263449",
  borderRadius: 14, padding: 18, minWidth: 0,
};
const muted: React.CSSProperties = { color: "#9ca3af", fontSize: 13 };
const button: React.CSSProperties = {
  background: "#2563eb", color: "white", border: 0, borderRadius: 8,
  padding: "10px 14px", cursor: "pointer", fontWeight: 650,
};

export default function ReferenceSlideLibrary() {
  const [selected, setSelected] = useState("breast");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [allSlides, setAllSlides] = useState<Slide[]>([]);
  const [slot, setSlot] = useState("1");
  const [file, setFile] = useState<File | null>(null);
  const [tissue, setTissue] = useState("");
  const [stain, setStain] = useState("H&E");
  const [source, setSource] = useState("");
  const [license, setLicense] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}/reference-slides/slides`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load reference slides.");
      const result = await response.json();
      setAllSlides(result.slides || []);
    } catch (error: any) {
      setMessage(error.message || "API connection failed.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setSlides(allSlides.filter((slide) => slide.cancer_id === selected));
  }, [allSlides, selected]);

  const occupied = (slotNumber: number) => slides.some((slide) => slide.slot === slotNumber);

  async function upload() {
    if (!file) { setMessage("Choose an image file first."); return; }
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.append("cancer_id", selected);
    form.append("slot", slot);
    form.append("tissue_type", tissue);
    form.append("stain", stain);
    form.append("source_url", source);
    form.append("license", license);
    form.append("notes", notes);
    form.append("file", file);
    try {
      const response = await fetch(`${API}/reference-slides/slides`, {
        method: "POST", body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Upload failed.");
      setMessage(`Uploaded successfully to ${selected}, reference slot ${slot}.`);
      setFile(null);
      setTissue(""); setSource(""); setLicense(""); setNotes("");
      const input = document.getElementById("reference-slide-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    } catch (error: any) {
      setMessage(error.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(slide: Slide) {
    if (!window.confirm(`Remove ${slide.original_name} from slot ${slide.slot}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`${API}/reference-slides/slides/${slide.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Delete failed.");
      setMessage(`Reference slot ${slide.slot} is now empty.`);
      await load();
    } catch (error: any) {
      setMessage(error.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const total = allSlides.length;
  const selectedName = cancers.find(([id]) => id === selected)?.[1] || selected;

  return (
    <main style={{ color: "#e5e7eb", maxWidth: 1500, margin: "0 auto", padding: "28px 22px 50px" }}>
      <header style={{ marginBottom: 22 }}>
        <div style={{ color: "#60a5fa", fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
          CYTOGENIX / RESEARCH IMAGE COLLECTION
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 750, margin: "8px 0" }}>Reference Slide Library</h1>
        <p style={muted}>A curated collection of five histopathology reference images for each of ten cancer categories.</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
        <div style={panel}><div style={muted}>Cancer categories</div><div style={{ fontSize: 28, fontWeight: 750 }}>10</div></div>
        <div style={panel}><div style={muted}>Reference capacity</div><div style={{ fontSize: 28, fontWeight: 750 }}>50</div></div>
        <div style={panel}><div style={muted}>Images uploaded</div><div style={{ fontSize: 28, fontWeight: 750 }}>{total} / 50</div></div>
      </section>

      {message && <div role="status" style={{ ...panel, marginBottom: 16, color: "#bfdbfe" }}>{message}</div>}

      <section style={{ ...panel, marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Choose cancer category</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 9 }}>
          {cancers.map(([id, name]) => {
            const count = allSlides.filter((s) => s.cancer_id === id).length;
            return (
              <button key={id} onClick={() => setSelected(id)} style={{
                textAlign: "left", borderRadius: 9, padding: 12, cursor: "pointer",
                border: selected === id ? "1px solid #60a5fa" : "1px solid #263449",
                background: selected === id ? "#1e3a5f" : "#0b1220", color: "#e5e7eb",
              }}>
                <div style={{ fontWeight: 700 }}>{name}</div>
                <div style={{ ...muted, marginTop: 5 }}>{count} of 5 images uploaded</div>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ ...panel, marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>{selectedName}: reference slides</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          {[1, 2, 3, 4, 5].map((number) => {
            const slide = slides.find((item) => item.slot === number);
            return (
              <div key={number} style={{ border: "1px solid #263449", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>Reference slide {number}</strong>
                  <span style={{ color: slide ? "#86efac" : "#fbbf24", fontSize: 12 }}>
                    {slide ? "Uploaded" : "Empty slot"}
                  </span>
                </div>
                {slide ? (
                  <>
                    <div style={{ marginTop: 12, background: "#080d16", borderRadius: 8, minHeight: 170, display: "grid", placeItems: "center", overflow: "hidden" }}>
                      {/\.(png|jpe?g|gif|webp)$/i.test(slide.original_name) ?
                        <img src={`${API}/reference-slides/slides/${slide.id}/file`} alt={slide.original_name} style={{ width: "100%", maxHeight: 300, objectFit: "contain" }} /> :
                        <div style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>TIFF image stored. Preview may not be supported by this browser.<br />Use the open-image link below.</div>}
                    </div>
                    <p style={{ fontWeight: 650, overflowWrap: "anywhere" }}>{slide.original_name}</p>
                    <p style={muted}>{slide.width} × {slide.height} pixels · {(slide.size_bytes / 1048576).toFixed(1)} MB</p>
                    <p style={muted}>Tissue: {slide.tissue_type || "Not specified"} · Stain: {slide.stain || "Not specified"}</p>
                    <p style={muted}>Licence: {slide.license || "Not specified"}</p>
                    {slide.source_url && <p><a href={slide.source_url} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>View source ↗</a></p>}
                    <p><a href={`${API}/reference-slides/slides/${slide.id}/file`} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>Open stored image ↗</a></p>
                    <button disabled={busy} onClick={async () => {
                      setBusy(true);
                      setMessage("");
                      try {
                        const response = await fetch(`${API}/reference-slides/slides/${slide.id}/send-to-microscopy`, { method: "POST" });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.detail || "Could not import image.");
                        setMessage(result.message);
                        window.location.href = "/workspaces/digital-microscopy";
                      } catch (error: any) {
                        setMessage(error.message || "Import failed.");
                      } finally {
                        setBusy(false);
                      }
                    }} style={{ ...button, background: "#047857", marginBottom: 10 }}>
                      Open in Digital Microscopy
                    </button>
                    <br />
                    <button disabled={busy} onClick={() => void remove(slide)} style={{ ...button, background: "#7f1d1d" }}>Remove image</button>
                  </>
                ) : (
                  <div style={{ minHeight: 190, display: "grid", placeItems: "center", color: "#6b7280", textAlign: "center" }}>
                    Upload one image into this slot using the form below.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={panel}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Upload reference image</h2>
        <p style={muted}>PNG, JPG, JPEG, TIF and TIFF accepted. Maximum file size: 100 MB per image.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <label style={muted}>Cancer category
            <select value={selected} onChange={(e) => setSelected(e.target.value)} style={field}>
              {cancers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label style={muted}>Reference slot
            <select value={slot} onChange={(e) => setSlot(e.target.value)} style={field}>
              <option value="1" disabled={occupied(1)}>Slot 1 {occupied(1) ? "(occupied)" : ""}</option>
              <option value="2" disabled={occupied(2)}>Slot 2 {occupied(2) ? "(occupied)" : ""}</option>
              <option value="3" disabled={occupied(3)}>Slot 3 {occupied(3) ? "(occupied)" : ""}</option>
              <option value="4" disabled={occupied(4)}>Slot 4 {occupied(4) ? "(occupied)" : ""}</option>
              <option value="5" disabled={occupied(5)}>Slot 5 {occupied(5) ? "(occupied)" : ""}</option>
            </select>
          </label>
          <label style={muted}>Tissue type
            <input value={tissue} onChange={(e) => setTissue(e.target.value)} placeholder="e.g. tumour tissue" style={field} />
          </label>
          <label style={muted}>Stain
            <input value={stain} onChange={(e) => setStain(e.target.value)} style={field} />
          </label>
          <label style={muted}>Source URL
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://..." style={field} />
          </label>
          <label style={muted}>Image licence
            <input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="e.g. CC BY 4.0" style={field} />
          </label>
        </div>
        <label style={{ ...muted, display: "block", marginTop: 12 }}>Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...field, resize: "vertical" }} />
        </label>
        <label style={{ ...muted, display: "block", marginTop: 12 }}>Choose microscope image
          <input id="reference-slide-file" type="file" accept=".png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: "block", marginTop: 8, color: "#e5e7eb" }} />
        </label>
        <button disabled={busy || !file || occupied(Number(slot))} onClick={() => void upload()} style={{ ...button, marginTop: 16, opacity: busy || !file || occupied(Number(slot)) ? 0.55 : 1 }}>
          {busy ? "Please wait…" : "Upload reference slide"}
        </button>
        <p style={{ ...muted, marginTop: 14, lineHeight: 1.6 }}>
          Upload only images you are permitted to use. Record the original source and licence. These reference images are for research and education, not clinical diagnosis or cancer detection.
        </p>
      </section>
    </main>
  );
}

const field: React.CSSProperties = {
  display: "block", width: "100%", boxSizing: "border-box", marginTop: 6,
  padding: 10, borderRadius: 8, border: "1px solid #374151",
  background: "#0b1220", color: "#e5e7eb",
};
