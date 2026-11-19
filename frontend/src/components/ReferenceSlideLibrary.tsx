"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import styles from "./ReferenceSlideLibrary.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const cancers = [
  ["breast", "Breast Cancer"],
  ["lung", "Lung Cancer"],
  ["colorectal", "Colorectal Cancer"],
  ["prostate", "Prostate Cancer"],
  ["stomach", "Stomach Cancer"],
  ["cervical", "Cervical Cancer"],
  ["bladder", "Bladder Cancer"],
  ["melanoma", "Melanoma"],
  ["kidney", "Kidney Cancer"],
  ["liver", "Liver Cancer"],
] as const;

type Slide = {
  id: string;
  cancer_id: string;
  cancer_name: string;
  slot: number;
  original_name: string;
  width: number;
  height: number;
  size_bytes: number;
  tissue_type?: string;
  stain?: string;
  source_url?: string;
  license?: string;
  notes?: string;
  file_url: string;
};

export default function ReferenceSlideLibrary() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selected, setSelected] = useState("breast");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [slot, setSlot] = useState("1");
  const [file, setFile] = useState<File | null>(null);
  const [tissue, setTissue] = useState("");
  const [stain, setStain] = useState("H&E");
  const [source, setSource] = useState("");
  const [license, setLicense] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Slide | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/reference-slides/slides`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Could not load slide library.");
      setSlides(Array.isArray(result.slides) ? result.slides : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend connection failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSlides = useMemo(
    () => slides.filter((slide) => slide.cancer_id === selected),
    [slides, selected]
  );

  const visibleSlides = useMemo(() => {
    const term = search.trim().toLowerCase();
    return slides.filter((slide) => {
      const matchesCategory = filter === "all" || slide.cancer_id === filter;
      const content = [
        slide.original_name,
        slide.cancer_name,
        slide.cancer_id,
        slide.tissue_type,
        slide.stain,
        slide.license,
        slide.notes,
      ].join(" ").toLowerCase();
      return matchesCategory && (!term || content.includes(term));
    });
  }, [slides, search, filter]);

  const occupied = (number: number) =>
    selectedSlides.some((slide) => slide.slot === number);

  const selectedName = cancers.find(([id]) => id === selected)?.[1] || selected;
  const capacity = 50;
  const totalSize = slides.reduce((sum, slide) => sum + slide.size_bytes, 0);
  const categoryCount = cancers.filter(([id]) =>
    slides.some((slide) => slide.cancer_id === id)
  ).length;

  function chooseCategory(id: string) {
    setSelected(id);
    setFilter("all");
    setSearch("");
    const firstAvailable = [1, 2, 3, 4, 5].find(
      (number) => !slides.some((slide) => slide.cancer_id === id && slide.slot === number)
    );
    setSlot(String(firstAvailable || 1));
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose an image file first.");
      return;
    }
    if (occupied(Number(slot))) {
      setError("That reference slot is already occupied.");
      return;
    }

    setBusy(true);
    setError("");
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
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Upload failed.");

      setMessage(`Successfully uploaded ${result.filename} to ${selectedName}, slot ${slot}.`);
      setFile(null);
      setTissue("");
      setSource("");
      setLicense("");
      setNotes("");
      const input = document.getElementById("reference-slide-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(slide: Slide) {
    if (!window.confirm(`Remove ${slide.original_name} from ${slide.cancer_name}, slot ${slide.slot}?`)) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API}/reference-slides/slides/${slide.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Delete failed.");
      setMessage(`Reference slide ${slide.slot} removed.`);
      if (preview?.id === slide.id) setPreview(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendToMicroscopy(slide: Slide) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `${API}/reference-slides/slides/${slide.id}/send-to-microscopy`,
        { method: "POST" }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Could not import image.");
      setMessage(result.message || "Image imported into Digital Microscopy.");
      window.location.href = "/workspaces/digital-microscopy";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setBusy(false);
    }
  }

  function imageUrl(slide: Slide) {
    return `${API}/reference-slides/slides/${slide.id}/file`;
  }

  function isBrowserPreviewable(slide: Slide) {
    return /\.(png|jpe?g|webp|gif)$/i.test(slide.original_name);
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>CYTOGENIX / RESEARCH IMAGE COLLECTION</div>
          <h1>Reference Slide Library</h1>
          <p>
            A centralised collection of histopathology reference images, organised
            by cancer category, tissue type, stain and source.
          </p>
        </div>
        <button className={styles.refresh} onClick={() => void load()} disabled={loading}>
          {loading ? "Loading..." : "↻ Refresh library"}
        </button>
      </header>

      <section className={styles.metrics}>
        <article><span>CANCER CATEGORIES</span><strong>10</strong><small>Organised collections</small></article>
        <article><span>LIBRARY CAPACITY</span><strong>50</strong><small>Five reference slots each</small></article>
        <article><span>UPLOADED IMAGES</span><strong>{slides.length} / 50</strong><small>{Math.max(0, 50 - slides.length)} available slots</small></article>
        <article><span>COLLECTION STORAGE</span><strong>{(totalSize / 1048576).toFixed(1)} MB</strong><small>{categoryCount} categories populated</small></article>
      </section>

      <section className={styles.progressPanel}>
        <div className={styles.progressHeading}>
          <strong>Collection completion</strong>
          <span>{Math.round((slides.length / capacity) * 100)}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressValue} style={{ width: `${(slides.length / capacity) * 100}%` }} />
        </div>
        <small>{slides.length} of 50 reference slots occupied</small>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.success}>{message}</div>}

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div><div className={styles.eyebrow}>COLLECTION CATALOGUE</div><h2>Browse cancer categories</h2></div>
          <span className={styles.tag}>10 COLLECTIONS</span>
        </div>
        <div className={styles.categoryGrid}>
          {cancers.map(([id, name]) => {
            const count = slides.filter((slide) => slide.cancer_id === id).length;
            return (
              <button key={id}
                className={`${styles.categoryCard} ${selected === id ? styles.categoryActive : ""}`}
                onClick={() => chooseCategory(id)}>
                <strong>{name}</strong>
                <span>{count} / 5 images</span>
                <div className={styles.miniTrack}>
                  <div style={{ width: `${count * 20}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div><div className={styles.eyebrow}>SELECTED COLLECTION</div><h2>{selectedName}</h2></div>
          <span className={styles.tag}>{selectedSlides.length} / 5 SLIDES</span>
        </div>
        <div className={styles.slotGrid}>
          {[1, 2, 3, 4, 5].map((number) => {
            const slide = selectedSlides.find((item) => item.slot === number);
            return (
              <article key={number} className={styles.slotCard}>
                <div className={styles.slotHeading}>
                  <strong>Reference slide {number}</strong>
                  <span className={slide ? styles.uploaded : styles.emptyStatus}>
                    {slide ? "UPLOADED" : "EMPTY"}
                  </span>
                </div>
                {slide ? (
                  <>
                    <button className={styles.imageButton} onClick={() => setPreview(slide)}>
                      {isBrowserPreviewable(slide) ? (
                        <img src={imageUrl(slide)} alt={slide.original_name} />
                      ) : (
                        <span className={styles.tiffMessage}>TIFF IMAGE<br/>Open image details ↗</span>
                      )}
                    </button>
                    <strong className={styles.filename}>{slide.original_name}</strong>
                    <p className={styles.metadata}>{slide.width} × {slide.height} pixels</p>
                    <p className={styles.metadata}>{(slide.size_bytes / 1048576).toFixed(2)} MB · {slide.stain || "Stain unspecified"}</p>
                    <p className={styles.metadata}>Tissue: {slide.tissue_type || "Not specified"}</p>
                    <div className={styles.actions}>
                      <button className={styles.secondary} onClick={() => setPreview(slide)}>View details</button>
                      <button className={styles.import} disabled={busy} onClick={() => void sendToMicroscopy(slide)}>Send to microscopy</button>
                    </div>
                    <button className={styles.remove} disabled={busy} onClick={() => void remove(slide)}>Remove reference</button>
                  </>
                ) : (
                  <div className={styles.emptySlot}>
                    <span>＋</span>
                    <p>This reference slot is available.</p>
                    <button className={styles.secondary} onClick={() => {
                      setSlot(String(number));
                      document.getElementById("upload-form")?.scrollIntoView({ behavior: "smooth" });
                    }}>Upload to this slot</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div><div className={styles.eyebrow}>IMAGE MANAGEMENT</div><h2>Upload reference slide</h2></div>
          <span className={styles.tag}>MAX 100 MB / IMAGE</span>
        </div>
        <form id="upload-form" className={styles.form} onSubmit={upload}>
          <div className={styles.formGrid}>
            <label>Cancer category
              <select value={selected} onChange={(event) => chooseCategory(event.target.value)}>
                {cancers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label>Reference slot
              <select value={slot} onChange={(event) => setSlot(event.target.value)}>
                {[1, 2, 3, 4, 5].map((number) =>
                  <option key={number} value={number} disabled={occupied(number)}>
                    Slot {number}{occupied(number) ? " — occupied" : " — available"}
                  </option>
                )}
              </select>
            </label>
            <label>Tissue type
              <input value={tissue} onChange={(event) => setTissue(event.target.value)} placeholder="e.g. tumour tissue" />
            </label>
            <label>Stain
              <input value={stain} onChange={(event) => setStain(event.target.value)} placeholder="e.g. H&E" />
            </label>
            <label>Source URL
              <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://..." />
            </label>
            <label>Image licence
              <input value={license} onChange={(event) => setLicense(event.target.value)} placeholder="e.g. CC BY 4.0" />
            </label>
          </div>
          <label>Research notes
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record specimen context, source details and observations." />
          </label>
          <label className={styles.filePicker}>Choose microscope image
            <input id="reference-slide-file" type="file" accept=".png,.jpg,.jpeg,.tif,.tiff" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <small>{file ? `${file.name} · ${(file.size / 1048576).toFixed(2)} MB` : "PNG, JPG, JPEG, TIF and TIFF supported"}</small>
          </label>
          <button className={styles.primary} type="submit" disabled={busy || !file || occupied(Number(slot))}>
            {busy ? "Please wait..." : "Upload reference slide"}
          </button>
          <p className={styles.disclaimer}>
            Upload only images you are permitted to use. Preserve original source and licence
            information. Reference slides are for research and education, not clinical diagnosis.
          </p>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div><div className={styles.eyebrow}>LIBRARY EXPLORER</div><h2>Search all reference slides</h2></div>
          <span className={styles.tag}>{visibleSlides.length} RESULTS</span>
        </div>
        <div className={styles.searchRow}>
          <input value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search filename, cancer type, tissue, stain, licence or notes..." />
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All cancer categories</option>
            {cancers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        {loading && <p className={styles.muted}>Loading collection...</p>}
        {!loading && visibleSlides.length === 0 && (
          <div className={styles.emptySearch}>No reference slides match this search.</div>
        )}
        <div className={styles.resultList}>
          {visibleSlides.map((slide) => (
            <button className={styles.resultRow} key={slide.id} onClick={() => {
              setSelected(slide.cancer_id);
              setPreview(slide);
            }}>
              <span className={styles.resultSlot}>#{slide.slot}</span>
              <span className={styles.resultInfo}>
                <strong>{slide.original_name}</strong>
                <small>{slide.cancer_name} · {slide.tissue_type || "Tissue unspecified"} · {slide.stain || "Stain unspecified"}</small>
              </span>
              <span className={styles.resultArrow}>View ↗</span>
            </button>
          ))}
        </div>
      </section>

      {preview && (
        <div className={styles.modalBackdrop} onClick={() => setPreview(null)}>
          <section className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.sectionHeading}>
              <div><div className={styles.eyebrow}>REFERENCE IMAGE DETAILS</div><h2>{preview.cancer_name}</h2></div>
              <button className={styles.close} onClick={() => setPreview(null)}>✕</button>
            </div>
            {isBrowserPreviewable(preview) ? (
              <img className={styles.largePreview} src={imageUrl(preview)} alt={preview.original_name} />
            ) : (
              <div className={styles.tiffMessage}>TIFF image. Browser preview may not be supported. Use the open image link below.</div>
            )}
            <h3>{preview.original_name}</h3>
            <p className={styles.metadata}>Slot {preview.slot} · {preview.width} × {preview.height} pixels · {(preview.size_bytes / 1048576).toFixed(2)} MB</p>
            <p className={styles.metadata}>Tissue: {preview.tissue_type || "Not specified"} · Stain: {preview.stain || "Not specified"}</p>
            <p className={styles.metadata}>Licence: {preview.license || "Not specified"}</p>
            {preview.notes && <p className={styles.modalNotes}>{preview.notes}</p>}
            {preview.source_url && <p><a href={preview.source_url} target="_blank" rel="noreferrer">Open original source ↗</a></p>}
            <p><a href={imageUrl(preview)} target="_blank" rel="noreferrer">Open stored image ↗</a></p>
            <button className={styles.import} disabled={busy} onClick={() => void sendToMicroscopy(preview)}>Open in Digital Microscopy</button>
          </section>
        </div>
      )}
    </main>
  );
}
