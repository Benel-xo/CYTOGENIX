"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./SpatialAnalysisWorkspace.module.css";

const API = "http://127.0.0.1:8000/api/v1";

type ImageItem = {
  id: string;
  original_name: string;
  width?: number | null;
  height?: number | null;
  file_format?: string;
};

type MorphRun = {
  run_id: string;
  created_at?: string;
  results?: {
    region_count?: number;
    source?: { filename?: string };
  };
};

type SpatialParameters = {
  grid_rows: number;
  grid_columns: number;
  cluster_epsilon_pixels: number;
  minimum_cluster_points: number;
};

type Candidate = {
  region_number: number;
  area_pixels?: number;
  centroid_x: number;
  centroid_y: number;
  cluster_id: number | null;
  is_noise: boolean;
  nearest_neighbour_distance_pixels: number | null;
};

type Results = {
  source?: {
    filename?: string;
    candidate_count?: number;
    analysis_width_pixels?: number;
    analysis_height_pixels?: number;
  };
  spatial_summary?: {
    candidate_count?: number;
    cluster_count?: number;
    noise_candidate_count?: number;
    clustered_candidate_percent?: number | null;
    largest_cluster_size?: number;
    occupied_tiles?: number;
    total_tiles?: number;
    occupied_tile_percent?: number;
    mean_candidates_per_tile?: number;
    tile_count_cv_percent?: number | null;
    shannon_entropy?: number | null;
    effective_occupied_tiles?: number;
    normalized_spatial_entropy?: number | null;
  };
  nearest_neighbour?: {
    count?: number;
    mean?: number | null;
    median?: number | null;
    std?: number | null;
    min?: number | null;
    max?: number | null;
  };
  clusters?: { cluster_id: number; candidate_count: number }[];
  spatial_grid?: { row: number; column: number; candidate_count: number }[];
  candidates?: Candidate[];
  method?: string;
  limitations?: string[];
};

type SpatialRun = {
  run_id: string;
  morphometry_run_id?: string;
  image_id?: string;
  filename?: string;
  created_at?: string;
  results?: Results;
  overlay_url?: string;
  density_url?: string;
  csv_url?: string;
};

const DEFAULTS: SpatialParameters = {
  grid_rows: 6,
  grid_columns: 6,
  cluster_epsilon_pixels: 45,
  minimum_cluster_points: 4,
};

function assetUrl(path?: string) {
  if (!path) return "";
  return path.startsWith("http") ? path : `${API.replace("/api/v1", "")}${path}`;
}

function fmt(value?: number | null, digits = 2) {
  return value === undefined || value === null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function date(value?: string) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function SpatialAnalysisWorkspace() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [imageId, setImageId] = useState("");
  const [morphRuns, setMorphRuns] = useState<MorphRun[]>([]);
  const [morphRunId, setMorphRunId] = useState("");
  const [parameters, setParameters] = useState<SpatialParameters>(DEFAULTS);
  const [run, setRun] = useState<SpatialRun | null>(null);
  const [history, setHistory] = useState<SpatialRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedImage = useMemo(
    () => images.find((item) => item.id === imageId),
    [images, imageId]
  );

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/microscopy/images`);
      if (!response.ok) throw new Error(`Image library request failed (${response.status}).`);
      const data = await response.json();
      const list: ImageItem[] = Array.isArray(data) ? data : data.images ?? data.items ?? [];
      setImages(list);
      setImageId((old) => old && list.some((item) => item.id === old) ? old : list[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load microscopy images.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMorphometryRuns = useCallback(async (selectedImageId: string) => {
    setMorphRuns([]);
    setMorphRunId("");
    setRun(null);
    setHistory([]);
    if (!selectedImageId) return;
    try {
      const cellularResponse = await fetch(`${API}/cellular-intelligence/images/${selectedImageId}/runs`);
      if (!cellularResponse.ok) throw new Error("Could not load Cellular Intelligence history.");
      const cellularData = await cellularResponse.json();
      const cellularRuns = cellularData.runs ?? [];
      const collected: MorphRun[] = [];
      for (const cellular of cellularRuns) {
        const cellularId = cellular.run_id ?? cellular.id;
        if (!cellularId) continue;
        const response = await fetch(`${API}/nuclear-morphometry/cellular-runs/${cellularId}/history`);
        if (!response.ok) continue;
        const data = await response.json();
        for (const item of data.runs ?? []) {
          collected.push({
            ...item,
            run_id: item.run_id ?? item.id,
            results: item.results,
          });
        }
      }
      collected.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
      setMorphRuns(collected.filter((item) => item.run_id));
      setMorphRunId(collected[0]?.run_id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load saved Morphometry runs.");
    }
  }, []);

  const loadHistory = useCallback(async (selectedMorphRunId: string) => {
    if (!selectedMorphRunId) {
      setHistory([]);
      return;
    }
    try {
      const response = await fetch(`${API}/spatial-analysis/morphometry-runs/${selectedMorphRunId}/history`);
      if (!response.ok) throw new Error("Could not load Spatial Analysis history.");
      const data = await response.json();
      setHistory(data.runs ?? []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => { void loadImages(); }, [loadImages]);
  useEffect(() => { void loadMorphometryRuns(imageId); }, [imageId, loadMorphometryRuns]);
  useEffect(() => {
    setRun(null);
    setNotice("");
    void loadHistory(morphRunId);
  }, [morphRunId, loadHistory]);

  function update<K extends keyof SpatialParameters>(key: K, value: number) {
    setParameters((old) => ({ ...old, [key]: value }));
  }

  async function analyse() {
    if (!morphRunId) {
      setError("Select a saved Nuclear Morphometry run first.");
      return;
    }
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API}/spatial-analysis/morphometry-runs/${morphRunId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parameters),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? response.status));
      }
      setRun(data);
      setNotice("Spatial analysis completed and saved to the database.");
      await loadHistory(morphRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Spatial analysis failed.");
    } finally {
      setRunning(false);
    }
  }

  async function viewHistory(item: SpatialRun) {
    try {
      const response = await fetch(`${API}/spatial-analysis/runs/${item.run_id}`);
      if (!response.ok) throw new Error("Could not load saved spatial run.");
      setRun(await response.json());
      setNotice("Showing a previously saved Spatial Analysis run.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load saved run.");
    }
  }

  const summary = run?.results?.spatial_summary;
  const nearest = run?.results?.nearest_neighbour;
  const metrics = [
    ["Candidate regions", fmt(summary?.candidate_count, 0), "From saved Morphometry measurements"],
    ["DBSCAN clusters", fmt(summary?.cluster_count, 0), "Geometric proximity groups"],
    ["Noise candidates", fmt(summary?.noise_candidate_count, 0), "Not assigned to a cluster"],
    ["Mean nearest neighbour", `${fmt(nearest?.mean)} px`, "Euclidean centroid distance"],
    ["Occupied tiles", `${fmt(summary?.occupied_tiles, 0)} / ${fmt(summary?.total_tiles, 0)}`, "Equal-sized image grid"],
    ["Tile-count CV", summary?.tile_count_cv_percent == null ? "—" : `${fmt(summary.tile_count_cv_percent)}%`, "Variation across all tiles"],
    ["Spatial entropy", fmt(summary?.shannon_entropy), "Shannon entropy of tile occupancy"],
    ["Effective occupied tiles", fmt(summary?.effective_occupied_tiles), "Exponentiated Shannon entropy"],
  ];

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>WORKSPACE 09 / SPATIAL DISTRIBUTION</div>
          <h1>Spatial Analysis &amp; Heterogeneity</h1>
          <p>Centroid-based spatial statistics, neighbourhood distances, clustering and regional density mapping.</p>
        </div>
        <span className={styles.status}>RESEARCH MODE</span>
      </header>

      <section className={styles.disclaimer}>
        <strong>Experimental research notice</strong>
        <p>This workspace analyses candidate regions measured by the earlier heuristic pipeline. Spatial clusters and heterogeneity metrics are mathematical summaries, not verified cell populations, biological conclusions or clinical findings.</p>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <span className={styles.tag}>01 / DATA SOURCE</span>
            <h2>Select image and saved morphometry run</h2>
            <p>Spatial Analysis requires a completed Nuclear Morphometry run for the selected image.</p>
          </div>
          <button className={styles.secondary} onClick={() => void loadImages()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh images"}
          </button>
        </div>
        {loading ? <p className={styles.empty}>Loading image library…</p> : images.length === 0 ? (
          <p className={styles.empty}>No microscopy images found. Upload an image in Digital Microscopy first.</p>
        ) : (
          <>
            <label className={styles.label} htmlFor="spatial-image">Registered microscopy image</label>
            <select id="spatial-image" className={styles.select} value={imageId} onChange={(event) => setImageId(event.target.value)}>
              {images.map((item) => <option key={item.id} value={item.id}>{item.original_name} · {item.id}</option>)}
            </select>
            {selectedImage && <div className={styles.imageInfo}>
              <span><small>FILE</small><b>{selectedImage.original_name}</b></span>
              <span><small>FORMAT</small><b>{selectedImage.file_format ?? "—"}</b></span>
              <span><small>DIMENSIONS</small><b>{selectedImage.width && selectedImage.height ? `${selectedImage.width} × ${selectedImage.height} px` : "—"}</b></span>
            </div>}
            <label className={styles.label} htmlFor="morph-run">Saved Nuclear Morphometry run</label>
            <select id="morph-run" className={styles.select} value={morphRunId} onChange={(event) => setMorphRunId(event.target.value)} disabled={morphRuns.length === 0}>
              {morphRuns.length === 0 ? <option value="">No Morphometry runs found for this image</option> : morphRuns.map((item) => (
                <option key={item.run_id} value={item.run_id}>{item.run_id} · {date(item.created_at)} · {fmt(item.results?.region_count, 0)} regions</option>
              ))}
            </select>
          </>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <span className={styles.tag}>02 / ANALYSIS PARAMETERS</span>
            <h2>Spatial grid and clustering settings</h2>
            <p>All distances use analysis-image pixels. Grid dimensions affect regional heterogeneity summaries.</p>
          </div>
          <button className={styles.textButton} onClick={() => { setParameters(DEFAULTS); setRun(null); }}>Reset defaults</button>
        </div>
        <div className={styles.parameters}>
          {([
            ["grid_rows", "Grid rows", 2, 20, 1],
            ["grid_columns", "Grid columns", 2, 20, 1],
            ["cluster_epsilon_pixels", "DBSCAN neighbourhood radius (px)", 1, 250, 1],
            ["minimum_cluster_points", "Minimum points per cluster", 2, 100, 1],
          ] as const).map(([key, label, min, max, step]) => (
            <label className={styles.parameter} key={key}>
              <span>{label}<b>{parameters[key]}</b></span>
              <input type="range" min={min} max={max} step={step} value={parameters[key]} onChange={(event) => update(key, Number(event.target.value))} />
            </label>
          ))}
        </div>
        <div className={styles.runBar}>
          <span>{morphRunId ? `Morphometry run: ${morphRunId}` : "Select a completed Morphometry run to continue"}</span>
          <button className={styles.primary} onClick={() => void analyse()} disabled={!morphRunId || running || loading}>
            {running ? "Calculating…" : "Run spatial analysis"}
          </button>
        </div>
      </section>

      {run?.results && (
        <>
          <section className={styles.resultsHeading}>
            <div><span className={styles.tag}>03 / RESULTS</span><h2>Spatial distribution report</h2><p>Run {run.run_id} · {date(run.created_at)}</p></div>
            {run.csv_url && <a className={styles.secondary} href={assetUrl(run.csv_url)}>Export candidates CSV ↓</a>}
          </section>

          <section className={styles.metrics}>
            {metrics.map(([label, value, detail]) => <article className={styles.metric} key={label}>
              <span>{label}</span><strong>{value}</strong><small>{detail}</small>
            </article>)}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div><span className={styles.tag}>04 / SPATIAL VISUALS</span><h2>Centroid overlay and density map</h2><p>Cluster colours are geometric DBSCAN labels; grey markers are noise points.</p></div>
            </div>
            <div className={styles.visuals}>
              {([["Candidate centroid and cluster overlay", run.overlay_url], ["Regional candidate density map", run.density_url]] as const).map(([label, url]) => (
                <article className={styles.visual} key={label}>
                  <h3>{label}</h3>
                  {url ? <a href={assetUrl(url)} target="_blank" rel="noreferrer"><img src={assetUrl(url)} alt={label} /></a> : <div className={styles.empty}>Visual unavailable</div>}
                  {url && <a className={styles.download} href={assetUrl(url)} target="_blank" rel="noreferrer">Open full image ↗</a>}
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}><div><span className={styles.tag}>05 / REGIONAL COUNTS</span><h2>Spatial density grid</h2><p>Candidate-region counts in each equal-sized image tile, including empty tiles.</p></div></div>
            <div className={styles.grid}>
              {(run.results.spatial_grid ?? []).map((tile) => <div className={styles.gridTile} key={`${tile.row}-${tile.column}`}>
                <small>{tile.row}:{tile.column}</small><strong>{tile.candidate_count}</strong>
              </div>)}
            </div>
            <div className={styles.tableWrap}>
              <table><thead><tr><th>Region</th><th>Area (px²)</th><th>Centroid (x, y)</th><th>Cluster</th><th>Nearest neighbour (px)</th></tr></thead>
                <tbody>{(run.results.candidates ?? []).slice(0, 150).map((item) => <tr key={item.region_number}>
                  <td>{item.region_number}</td><td>{fmt(item.area_pixels, 0)}</td><td>{fmt(item.centroid_x, 1)}, {fmt(item.centroid_y, 1)}</td>
                  <td>{item.cluster_id == null ? (item.is_noise ? "Noise" : "—") : `Cluster ${item.cluster_id + 1}`}</td>
                  <td>{fmt(item.nearest_neighbour_distance_pixels, 2)}</td>
                </tr>)}</tbody>
              </table>
              {(run.results.candidates ?? []).length > 150 && <p className={styles.note}>Showing first 150 of {run.results.candidates?.length} candidates. Export CSV for the complete table.</p>}
              {(run.results.candidates ?? []).length === 0 && <p className={styles.empty}>No valid centroid measurements were available in this Morphometry run.</p>}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}><div><span className={styles.tag}>06 / METHOD</span><h2>Interpretation and limitations</h2></div></div>
            <p className={styles.method}>{run.results.method}</p>
            <ul className={styles.limitations}>{(run.results.limitations ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span className={styles.tag}>07 / DATABASE</span><h2>Saved spatial analysis history</h2><p>Previous spatial runs for the selected Morphometry result.</p></div></div>
        {!morphRunId ? <p className={styles.empty}>Select a Morphometry run to view its analysis history.</p> : history.length === 0 ? <p className={styles.empty}>No saved spatial runs yet.</p> : (
          <div className={styles.history}>{history.map((item) => <div className={styles.historyItem} key={item.run_id}>
            <span><b>{item.run_id}</b><small>{date(item.created_at)} · {fmt(item.results?.spatial_summary?.candidate_count, 0)} candidate regions · {fmt(item.results?.spatial_summary?.cluster_count, 0)} clusters</small></span>
            <button className={styles.secondary} onClick={() => void viewHistory(item)}>View run</button>
          </div>)}</div>
        )}
      </section>
      <footer className={styles.footer}>CYTOGENIX · Spatial Analysis &amp; Heterogeneity · Experimental research workspace</footer>
    </main>
  );
}
