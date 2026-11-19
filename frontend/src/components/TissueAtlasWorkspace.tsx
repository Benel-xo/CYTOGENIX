"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./TissueAtlasWorkspace.module.css";

const API = "http://127.0.0.1:8000/api/v1";

type Entry = {
  id: string;
  name: string;
  category: string;
  description: string;
  microscopic_features: string;
  research_notes: string;
  image_reference: string;
  created_at?: string;
};

type Note = {
  id: string;
  title: string;
  content: string;
  category: string;
  created_at?: string;
};

const blankEntry = {
  name: "",
  category: "General",
  description: "",
  microscopic_features: "",
  research_notes: "",
  image_reference: "",
};

const blankNote = {
  title: "",
  category: "General",
  content: "",
};

const categories = [
  "General",
  "Epithelial",
  "Connective",
  "Muscle",
  "Nervous",
  "Blood",
  "Lymphoid",
  "Organ tissue",
  "Research reference",
];

export default function TissueAtlasWorkspace() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [entryForm, setEntryForm] = useState(blankEntry);
  const [noteForm, setNoteForm] = useState(blankNote);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [entryResponse, noteResponse] = await Promise.all([
        fetch(`${API}/tissue-atlas/entries`, { cache: "no-store" }),
        fetch(`${API}/tissue-atlas/notes`, { cache: "no-store" }),
      ]);
      const entryData = await entryResponse.json();
      const noteData = await noteResponse.json();
      if (!entryResponse.ok) throw new Error(entryData.detail || "Could not load atlas.");
      if (!noteResponse.ok) throw new Error(noteData.detail || "Could not load notes.");
      setEntries(Array.isArray(entryData.entries) ? entryData.entries : []);
      setNotes(Array.isArray(noteData.notes) ? noteData.notes : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "API connection failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesCategory = !category || entry.category === category;
      const content = [
        entry.name,
        entry.category,
        entry.description,
        entry.microscopic_features,
        entry.research_notes,
      ].join(" ").toLowerCase();
      return matchesCategory && (!term || content.includes(term));
    });
  }, [entries, search, category]);

  async function saveEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API}/tissue-atlas/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entryForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save atlas entry.");
      setEntries((current) => [data.entry, ...current]);
      setSelected(data.entry);
      setEntryForm(blankEntry);
      setMessage("Tissue reference saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save entry.");
    } finally {
      setSaving(false);
    }
  }

  async function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API}/tissue-atlas/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noteForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save note.");
      setNotes((current) => [data.note, ...current]);
      setNoteForm(blankNote);
      setMessage("Research note saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(kind: "entries" | "notes", id: string) {
    if (!window.confirm("Delete this saved item?")) return;
    try {
      const response = await fetch(`${API}/tissue-atlas/${kind}/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Delete failed.");
      if (kind === "entries") {
        setEntries((current) => current.filter((item) => item.id !== id));
        if (selected?.id === id) setSelected(null);
      } else {
        setNotes((current) => current.filter((item) => item.id !== id));
      }
      setMessage("Item deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete item.");
    }
  }

  function askAssistant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = assistantQuestion.trim().toLowerCase();
    if (!question) return;

    const matches = entries.filter((entry) => {
      const searchable = [
        entry.name,
        entry.category,
        entry.description,
        entry.microscopic_features,
        entry.research_notes,
      ].join(" ").toLowerCase();
      return question.split(/\s+/).some((word) => word.length > 3 && searchable.includes(word));
    });

    if (matches.length) {
      setAssistantAnswer(
        `I found ${matches.length} matching reference${matches.length === 1 ? "" : "s"} in your saved Tissue Atlas:\n\n` +
        matches.slice(0, 5).map((entry) =>
          `${entry.name} (${entry.category})\n${entry.description || "No description entered."}\nMicroscopic features: ${entry.microscopic_features || "Not documented."}`
        ).join("\n\n") +
        "\n\nThese are your saved research notes, not an independent diagnosis or a validated AI interpretation."
      );
    } else {
      setAssistantAnswer(
        "I could not find a matching entry in your saved Tissue Atlas. Try searching by a tissue name or add a reference using the atlas editor.\n\nResearch prompt: describe the tissue architecture, cell arrangement, staining characteristics, extracellular components, specimen preparation and limitations. Compare observations with a recognised histology textbook or peer-reviewed source. This local assistant searches your saved atlas only; it is not connected to a generative AI model."
      );
    }
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>MODULE 15 / HISTOLOGY KNOWLEDGE</div>
          <h1>Tissue Atlas &amp; AI Assistant</h1>
          <p>Organise tissue references, document microscopic observations and search your own research knowledge.</p>
        </div>
        <button className={styles.refresh} onClick={() => void refresh()} disabled={loading}>
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>
      </header>

      <section className={styles.metrics}>
        <article><span>ATLAS REFERENCES</span><strong>{entries.length}</strong><small>Saved tissue entries</small></article>
        <article><span>RESEARCH NOTES</span><strong>{notes.length}</strong><small>Stored observations</small></article>
        <article><span>TISSUE CATEGORIES</span><strong>{new Set(entries.map((item) => item.category)).size}</strong><small>Categories represented</small></article>
        <article><span>KNOWLEDGE SEARCH</span><strong>LOCAL</strong><small>Searches saved atlas content</small></article>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.success}>{message}</div>}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div><div className={styles.eyebrow}>REFERENCE LIBRARY</div><h2>Search tissue atlas</h2></div>
          <span className={styles.tag}>{visibleEntries.length} MATCHES</span>
        </div>
        <div className={styles.searchRow}>
          <input value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tissue names, features and observations..." />
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        {loading && <p className={styles.muted}>Loading tissue atlas...</p>}
        {!loading && visibleEntries.length === 0 && (
          <div className={styles.empty}>
            <h3>No matching tissue references</h3>
            <p>Add your first tissue reference below. The atlas will contain only entries you actually save.</p>
          </div>
        )}
        <div className={styles.entryGrid}>
          {visibleEntries.map((entry) => (
            <button key={entry.id}
              className={`${styles.entryCard} ${selected?.id === entry.id ? styles.active : ""}`}
              onClick={() => setSelected(entry)}>
              <span className={styles.category}>{entry.category}</span>
              <strong>{entry.name}</strong>
              <span>{entry.description || "No description recorded."}</span>
              <small>Open reference ↗</small>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><div className={styles.eyebrow}>SELECTED REFERENCE</div><h2>{selected.name}</h2></div>
            <button className={styles.delete} onClick={() => void deleteItem("entries", selected.id)}>Delete</button>
          </div>
          <div className={styles.detailGrid}>
            <div><span>CATEGORY</span><strong>{selected.category}</strong></div>
            <div><span>IMAGE REFERENCE</span><strong>{selected.image_reference || "Not supplied"}</strong></div>
          </div>
          <h3>Description</h3><p className={styles.prose}>{selected.description || "No description recorded."}</p>
          <h3>Microscopic features</h3><p className={styles.prose}>{selected.microscopic_features || "Not documented."}</p>
          <h3>Research notes</h3><p className={styles.prose}>{selected.research_notes || "No notes recorded."}</p>
        </section>
      )}

      <div className={styles.twoColumns}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><div className={styles.eyebrow}>ATLAS MANAGEMENT</div><h2>Add tissue reference</h2></div>
          </div>
          <form className={styles.form} onSubmit={saveEntry}>
            <label>Tissue name<input required minLength={2} value={entryForm.name}
              onChange={(event) => setEntryForm({ ...entryForm, name: event.target.value })}
              placeholder="e.g. Simple columnar epithelium" /></label>
            <label>Category<select value={entryForm.category}
              onChange={(event) => setEntryForm({ ...entryForm, category: event.target.value })}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select></label>
            <label>Description<textarea rows={3} value={entryForm.description}
              onChange={(event) => setEntryForm({ ...entryForm, description: event.target.value })}
              placeholder="Describe the tissue and its context." /></label>
            <label>Microscopic features<textarea rows={4} value={entryForm.microscopic_features}
              onChange={(event) => setEntryForm({ ...entryForm, microscopic_features: event.target.value })}
              placeholder="Record architecture, cell arrangement, staining and observable structures." /></label>
            <label>Research notes<textarea rows={3} value={entryForm.research_notes}
              onChange={(event) => setEntryForm({ ...entryForm, research_notes: event.target.value })}
              placeholder="Add references, observations and limitations." /></label>
            <label>Image reference (optional)<input value={entryForm.image_reference}
              onChange={(event) => setEntryForm({ ...entryForm, image_reference: event.target.value })}
              placeholder="Image filename or reference identifier" /></label>
            <button className={styles.primary} disabled={saving}>Save tissue reference</button>
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><div className={styles.eyebrow}>RESEARCH NOTEBOOK</div><h2>Research notes</h2></div>
            <span className={styles.tag}>{notes.length} NOTES</span>
          </div>
          <form className={styles.form} onSubmit={saveNote}>
            <label>Note title<input required minLength={2} value={noteForm.title}
              onChange={(event) => setNoteForm({ ...noteForm, title: event.target.value })}
              placeholder="Observation or research question" /></label>
            <label>Category<select value={noteForm.category}
              onChange={(event) => setNoteForm({ ...noteForm, category: event.target.value })}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select></label>
            <label>Note content<textarea rows={5} value={noteForm.content}
              onChange={(event) => setNoteForm({ ...noteForm, content: event.target.value })}
              placeholder="Record your observation, source and interpretation." /></label>
            <button className={styles.primary} disabled={saving}>Save research note</button>
          </form>
          <div className={styles.noteList}>
            {notes.map((note) => (
              <article key={note.id} className={styles.note}>
                <div><strong>{note.title}</strong><span>{note.category}</span></div>
                <p>{note.content || "No content."}</p>
                <button className={styles.delete} onClick={() => void deleteItem("notes", note.id)}>Delete note</button>
              </article>
            ))}
            {!loading && notes.length === 0 && <p className={styles.muted}>Your saved research notes will appear here.</p>}
          </div>
        </section>
      </div>

      <section className={styles.assistant}>
        <div className={styles.eyebrow}>ATLAS KNOWLEDGE ASSISTANT</div>
        <h2>Ask your Tissue Atlas</h2>
        <p>Search your saved tissue references using a natural-language question.</p>
        <form onSubmit={askAssistant} className={styles.askRow}>
          <input value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)}
            placeholder="e.g. What microscopic features have I recorded for epithelial tissue?" />
          <button className={styles.primary}>Search atlas</button>
        </form>
        {assistantAnswer && <pre className={styles.answer}>{assistantAnswer}</pre>}
        <div className={styles.assistantDisclaimer}>
          This is a local knowledge-search assistant, not a connected generative AI model.
          It retrieves your saved content and does not diagnose tissue images or provide clinical advice.
        </div>
      </section>
    </main>
  );
}
