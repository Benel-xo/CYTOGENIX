"use client";

import { useCallback, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Data = any;

function bytes(value: number) {
  if (!Number.isFinite(value)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return `${size.toFixed(1)} ${units[index]}`;
}

const panel: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #263449",
  borderRadius: 14,
  padding: 20,
  minWidth: 0,
};

const muted: React.CSSProperties = { color: "#9ca3af", fontSize: 13 };
const button: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: 0,
  borderRadius: 9,
  padding: "10px 15px",
  cursor: "pointer",
  fontWeight: 600,
};

export default function DatasetLaboratoryWorkspace() {
  const [data, setData] = useState<Data>(null);
  const [audit, setAudit] = useState<Data[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewResponse, auditResponse] = await Promise.all([
        fetch(`${API}/dataset-laboratory/overview`, { cache: "no-store" }),
        fetch(`${API}/dataset-laboratory/audit?limit=12`, { cache: "no-store" }),
      ]);
      if (!overviewResponse.ok) throw new Error(`Overview API returned ${overviewResponse.status}`);
      const overview = await overviewResponse.json();
      setData(overview);
      if (auditResponse.ok) {
        const result = await auditResponse.json();
        setAudit(result.events || []);
      }
      setMessage("");
    } catch (error: any) {
      setMessage(error?.message || "Unable to connect to the Dataset Laboratory API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runScan() {
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch(`${API}/dataset-laboratory/scan`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Dataset scan failed.");
      setMessage(`Scan complete. Training images: ${result.training.image_count}; validation images: ${result.validation.image_count}.`);
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Scan failed.");
    } finally {
      setWorking(false);
    }
  }

  async function viewAcquisitionPlan() {
    setWorking(true);
    try {
      const response = await fetch(`${API}/dataset-laboratory/acquisition-plan`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Could not prepare acquisition plan.");
      setMessage(`Acquisition plan ready. Estimated download: ${result.estimated_total_download}. No download was started.`);
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Could not prepare acquisition plan.");
    } finally {
      setWorking(false);
    }
  }

  if (loading && !data) {
    return <main style={{ padding: 28, color: "#e5e7eb" }}>Loading CYTOGENIX Dataset Laboratory…</main>;
  }

  const local = data?.storage?.local;
  const registry = data?.registry_connection;
  const training = data?.local_datasets?.training;
  const validation = data?.local_datasets?.validation;

  return (
    <main style={{ color: "#e5e7eb", padding: "28px 24px 50px", maxWidth: 1500, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ color: "#60a5fa", fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>CYTOGENIX / RESEARCH INFRASTRUCTURE</div>
          <h1 style={{ fontSize: 30, fontWeight: 750, margin: "8px 0" }}>Dataset Laboratory</h1>
          <p style={muted}>Research dataset registry, hybrid storage, integrity checks and training preparation.</p>
        </div>
        <button style={button} onClick={() => void load()}>Refresh dashboard</button>
      </header>

      {message && <div role="status" style={{ ...panel, marginBottom: 18, color: "#bfdbfe" }}>{message}</div>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 18 }}>
        {[
          ["Cancer programmes", "10"],
          ["Registered verified datasets", String(data?.registry?.length ?? 0)],
          ["Training images installed", String(training?.image_count ?? 0)],
          ["Validation images installed", String(validation?.image_count ?? 0)],
        ].map(([label, value]) => (
          <div key={label} style={panel}>
            <div style={muted}>{label}</div>
            <div style={{ fontSize: 29, fontWeight: 750, marginTop: 8 }}>{value}</div>
          </div>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, marginBottom: 18 }}>
        <div style={panel}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 0 }}>Cloud registry</h2>
          <div style={{ color: registry?.connected ? "#86efac" : "#fbbf24", fontWeight: 700 }}>
            {registry?.connected ? "Connected to Hugging Face" : "Cloud unavailable / local fallback"}
          </div>
          <p style={muted}>Repository: Ben0205/cytogenix-research-data</p>
          <a href="https://huggingface.co/datasets/Ben0205/cytogenix-research-data" target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>Open cloud repository ↗</a>
          <p style={muted}>The repository currently stores registry metadata. The large image archives have not been uploaded.</p>
          {registry?.warning && <p style={{ color: "#fbbf24", fontSize: 12 }}>Connection note: {registry.warning}</p>}
        </div>

        <div style={panel}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 0 }}>Local storage</h2>
          <div style={{ fontSize: 26, fontWeight: 750 }}>{bytes(local?.free_bytes)} free</div>
          <p style={muted}>Used: {bytes(local?.used_bytes)} of {bytes(local?.total_bytes)}</p>
          <div style={{ height: 9, borderRadius: 8, background: "#263449", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, local?.used_percent || 0)}%`, background: "#3b82f6" }} />
          </div>
          <p style={muted}>Disk usage for the CYTOGENIX project volume.</p>
        </div>
      </section>

      <section style={{ ...panel, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 5px" }}>Ten-cancer research programme</h2>
            <p style={muted}>Only colorectal currently has verified source metadata in this registry.</p>
          </div>
          <span style={{ ...muted, color: "#fbbf24" }}>Catalogue does not mean datasets are installed</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 16 }}>
          {(data?.programmes || []).map((program: any) => (
            <div key={program.id} style={{ border: "1px solid #263449", borderRadius: 10, padding: 13 }}>
              <div style={{ fontWeight: 700 }}>{program.name}</div>
              <div style={{ ...muted, marginTop: 6 }}>{program.status}</div>
              <div style={{ fontSize: 12, marginTop: 8, color: program.dataset_installed ? "#86efac" : "#fbbf24" }}>
                {program.local_image_count} local images
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, marginBottom: 18 }}>
        <div style={panel}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 0 }}>Training dataset</h2>
          <div style={{ fontSize: 24, fontWeight: 750 }}>{training?.image_count ?? 0} images</div>
          <p style={muted}>{training?.directory}</p>
          <p style={muted}>{training?.class_count ?? 0} detected classes</p>
          <div style={{ color: training?.ready_for_basic_training ? "#86efac" : "#fbbf24", fontSize: 13 }}>
            {training?.ready_for_basic_training ? "Basic folder structure detected" : "Not ready for basic training"}
          </div>
        </div>
        <div style={panel}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 0 }}>Independent validation dataset</h2>
          <div style={{ fontSize: 24, fontWeight: 750 }}>{validation?.image_count ?? 0} images</div>
          <p style={muted}>{validation?.directory}</p>
          <p style={muted}>{validation?.class_count ?? 0} detected classes</p>
          <div style={{ color: "#93c5fd", fontSize: 13 }}>Kept separate from the training directory</div>
        </div>
      </section>

      <section style={{ ...panel, marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>Dataset operations</h2>
        <p style={muted}>Scanning checks local folder structure. Acquisition planning does not start a download.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button style={{ ...button, opacity: working ? 0.6 : 1 }} disabled={working} onClick={() => void runScan()}>
            {working ? "Working…" : "Scan local datasets"}
          </button>
          <button style={{ ...button, background: "#374151", opacity: working ? 0.6 : 1 }} disabled={working} onClick={() => void viewAcquisitionPlan()}>
            View download requirements
          </button>
        </div>
      </section>

      <section style={{ ...panel, marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>Registered dataset source</h2>
        {(data?.registry || []).map((item: any) => (
          <div key={item.dataset_id}>
            <div style={{ fontWeight: 700 }}>{item.title}</div>
            <p style={muted}>Programme: {item.program_id} · Source: {item.source_type} · Licence: {item.license}</p>
            <a href={item.source_url} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>Open original dataset source ↗</a>
            <p style={muted}>DOI: {item.metadata?.doi || "Not supplied"}</p>
          </div>
        ))}
      </section>

      <section style={panel}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>Research audit history</h2>
        {audit.length === 0 ? <p style={muted}>No audit events recorded yet. Run a dataset scan to create the first event.</p> :
          audit.map((event: any) => (
            <div key={event.event_id} style={{ padding: "10px 0", borderBottom: "1px solid #263449" }}>
              <div style={{ fontWeight: 650 }}>{event.event_type}</div>
              <div style={muted}>{event.created_at ? new Date(event.created_at).toLocaleString() : ""}</div>
            </div>
          ))}
      </section>

      <p style={{ ...muted, marginTop: 22, lineHeight: 1.7 }}>
        Scientific integrity: folder readiness is not proof of dataset quality. Current Module 11 training still uses an image-level random split and does not yet consume the independent validation directory. CYTOGENIX outputs are for experimental biomedical research and education, not clinical diagnosis.
      </p>
    </main>
  );
}
