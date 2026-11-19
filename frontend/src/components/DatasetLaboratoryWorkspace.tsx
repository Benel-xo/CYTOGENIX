"use client";

import { useCallback, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type AnyData = any;

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

const muted: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: 13,
  lineHeight: 1.6,
};

const button: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: 0,
  borderRadius: 9,
  padding: "10px 15px",
  cursor: "pointer",
  fontWeight: 650,
};

const heading: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  marginTop: 0,
};

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div style={panel}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 750, marginTop: 8 }}>{value}</div>
      {detail && <div style={{ ...muted, marginTop: 5 }}>{detail}</div>}
    </div>
  );
}

function DatasetCard({ title, dataset }: { title: string; dataset: AnyData }) {
  return (
    <div style={panel}>
      <h2 style={heading}>{title}</h2>
      <div style={{ fontSize: 27, fontWeight: 750 }}>
        {(dataset?.image_count ?? 0).toLocaleString()} images
      </div>
      <p style={muted}>{dataset?.directory || "Directory unavailable"}</p>
      <div style={{ ...muted, marginBottom: 12 }}>
        {dataset?.class_count ?? 0} detected classes
        {dataset?.scan_truncated ? " · Scan reached its file limit" : ""}
      </div>
      {dataset?.classes?.length > 0 ? (
        <div style={{ display: "grid", gap: 9 }}>
          {dataset.classes.map((item: AnyData) => (
            <div key={item.name}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                <strong>{item.name}</strong>
                <span>{item.image_count.toLocaleString()} images</span>
              </div>
              <div style={{ height: 7, background: "#263449", borderRadius: 8, overflow: "hidden", marginTop: 5 }}>
                <div style={{
                  height: "100%",
                  width: `${Math.max(1, (item.image_count / Math.max(1, dataset.image_count)) * 100)}%`,
                  background: "#3b82f6",
                  borderRadius: 8,
                }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ ...muted, color: "#fbbf24" }}>No class folders containing images detected.</p>
      )}
      <div style={{
        marginTop: 15,
        color: dataset?.available ? "#86efac" : "#fbbf24",
        fontSize: 13,
        fontWeight: 650,
      }}>
        {dataset?.ready_for_basic_training
          ? "Basic training folder structure detected"
          : dataset?.available
            ? "Images detected — training readiness requirements not met"
            : "Images not installed"}
      </div>
    </div>
  );
}

export default function DatasetLaboratoryWorkspace() {
  const [data, setData] = useState<AnyData>(null);
  const [audit, setAudit] = useState<AnyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [operationResult, setOperationResult] = useState<AnyData>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewResponse, auditResponse] = await Promise.all([
        fetch(`${API}/dataset-laboratory/overview`, { cache: "no-store" }),
        fetch(`${API}/dataset-laboratory/audit?limit=15`, { cache: "no-store" }),
      ]);

      if (!overviewResponse.ok) {
        throw new Error(`Dataset API returned ${overviewResponse.status}`);
      }

      setData(await overviewResponse.json());

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

  useEffect(() => {
    void load();
  }, [load]);

  async function operate(path: string, body?: AnyData, success?: (result: AnyData) => string) {
    setWorking(true);
    setMessage("");
    setOperationResult(null);

    try {
      const response = await fetch(`${API}/dataset-laboratory/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || `Operation failed (${response.status}).`);
      }

      setOperationResult(result);
      setMessage(success ? success(result) : "Operation completed successfully.");
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Operation failed.");
    } finally {
      setWorking(false);
    }
  }

  const training = data?.local_datasets?.training;
  const validation = data?.local_datasets?.validation;
  const storage = data?.storage?.local;
  const registry = data?.registry_connection;
  const registered = data?.registry || [];

  if (loading && !data) {
    return <main style={{ padding: 28, color: "#e5e7eb" }}>Loading CYTOGENIX Dataset Laboratory…</main>;
  }

  return (
    <main style={{
      color: "#e5e7eb",
      padding: "28px 24px 55px",
      maxWidth: 1500,
      margin: "0 auto",
    }}>
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: 25,
      }}>
        <div>
          <div style={{ color: "#60a5fa", fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
            CYTOGENIX / RESEARCH INFRASTRUCTURE
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 750, margin: "8px 0" }}>Dataset Laboratory</h1>
          <p style={muted}>Dataset management, image integrity, provenance, storage and research readiness.</p>
        </div>
        <button style={button} disabled={working} onClick={() => void load()}>
          Refresh dashboard
        </button>
      </header>

      {message && (
        <div role="status" style={{ ...panel, marginBottom: 18, color: "#bfdbfe" }}>
          {message}
        </div>
      )}

      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
        gap: 14,
        marginBottom: 20,
      }}>
        <Metric label="Cancer research programmes" value={data?.programmes?.length ?? 0} />
        <Metric label="Registered datasets" value={registered.length} />
        <Metric label="Training images installed" value={(training?.image_count ?? 0).toLocaleString()} />
        <Metric label="Validation images installed" value={(validation?.image_count ?? 0).toLocaleString()} />
      </section>

      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
        gap: 16,
        marginBottom: 20,
      }}>
        <div style={panel}>
          <h2 style={heading}>Cloud metadata registry</h2>
          <div style={{
            color: registry?.connected ? "#86efac" : "#fbbf24",
            fontWeight: 700,
          }}>
            {registry?.connected ? "Connected to Hugging Face" : "Local registry fallback"}
          </div>
          <p style={muted}>Repository: Ben0205/cytogenix-research-data</p>
          <a
            href="https://huggingface.co/datasets/Ben0205/cytogenix-research-data"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#93c5fd" }}
          >
            Open cloud repository ↗
          </a>
          <p style={muted}>
            The cloud repository is used for metadata. Dataset archives are not assumed to be uploaded.
          </p>
          {registry?.warning && <p style={{ color: "#fbbf24", fontSize: 12 }}>{registry.warning}</p>}
        </div>

        <div style={panel}>
          <h2 style={heading}>Local project storage</h2>
          <div style={{ fontSize: 27, fontWeight: 750 }}>{bytes(storage?.free_bytes)} free</div>
          <p style={muted}>
            Used: {bytes(storage?.used_bytes)} of {bytes(storage?.total_bytes)}
          </p>
          <div style={{ height: 10, background: "#263449", borderRadius: 8, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, storage?.used_percent || 0)}%`,
              background: "#3b82f6",
            }} />
          </div>
          <p style={muted}>Disk usage of the CYTOGENIX project volume.</p>
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 750, marginBottom: 12 }}>Local dataset inspection</h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))",
          gap: 16,
        }}>
          <DatasetCard title="NCT-CRC-HE-100K · Training" dataset={training} />
          <DatasetCard title="CRC-VAL-HE-7K · Independent validation" dataset={validation} />
        </div>
      </section>

      <section style={{ ...panel, marginBottom: 20 }}>
        <h2 style={heading}>Dataset operations</h2>
        <p style={muted}>
          Operations inspect existing local files. They do not automatically download or modify dataset archives.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 15 }}>
          <button style={button} disabled={working} onClick={() =>
            void operate("scan", undefined, result =>
              `Scan complete: ${result.training.image_count} training images and ${result.validation.image_count} validation images found.`
            )
          }>
            Scan local datasets
          </button>

          <button
            style={{ ...button, background: "#475569" }}
            disabled={working || !training?.available}
            onClick={() =>
              void operate("verify", { dataset_name: "NCT-CRC-HE-100K" }, result =>
                `Sample verification complete: ${result.readable_images}/${result.checked_images} sampled images readable.`
              )
            }
          >
            Verify sample images
          </button>

          <button
            style={{ ...button, background: "#0f766e" }}
            disabled={working || !training?.available}
            onClick={() =>
              void operate(
                "prepare-training",
                {
                  training_dataset: "NCT-CRC-HE-100K",
                  validation_dataset: validation?.available ? "CRC-VAL-HE-7K" : undefined,
                },
                result => result.status === "prepared_for_module_11"
                  ? "Training readiness check completed. This does not start model training."
                  : "Training preparation check completed."
              )
            }
          >
            Check training readiness
          </button>

          <button
            style={{ ...button, background: "#374151" }}
            disabled={working}
            onClick={() =>
              void operate("acquisition-plan", undefined, result =>
                `Acquisition plan prepared: ${result.estimated_total_download}. No download was started.`
              )
            }
          >
            View acquisition requirements
          </button>
        </div>
        {working && <p style={{ ...muted, marginTop: 12 }}>Working… please wait.</p>}
      </section>

      {operationResult && (
        <section style={{ ...panel, marginBottom: 20 }}>
          <h2 style={heading}>Latest operation result</h2>
          <pre style={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            fontSize: 12,
            lineHeight: 1.6,
            color: "#bfdbfe",
            maxHeight: 350,
            overflow: "auto",
          }}>
            {JSON.stringify(operationResult, null, 2)}
          </pre>
        </section>
      )}

      <section style={{ ...panel, marginBottom: 20 }}>
        <h2 style={heading}>Cancer research programme catalogue</h2>
        <p style={muted}>
          These are programme categories, not proof that datasets have been acquired or verified.
        </p>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 10,
          marginTop: 15,
        }}>
          {(data?.programmes || []).map((program: AnyData) => (
            <div key={program.id} style={{
              border: "1px solid #263449",
              borderRadius: 10,
              padding: 13,
            }}>
              <div style={{ fontWeight: 700 }}>{program.name}</div>
              <div style={{ ...muted, marginTop: 5 }}>{program.status}</div>
              <div style={{
                fontSize: 12,
                marginTop: 8,
                color: program.dataset_installed ? "#86efac" : "#fbbf24",
              }}>
                {(program.local_image_count ?? 0).toLocaleString()} local images
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...panel, marginBottom: 20 }}>
        <h2 style={heading}>Verified dataset provenance</h2>
        {registered.length === 0 ? (
          <p style={muted}>No datasets registered.</p>
        ) : registered.map((item: AnyData) => (
          <div key={item.dataset_id} style={{
            padding: "12px 0",
            borderBottom: "1px solid #263449",
          }}>
            <div style={{ fontWeight: 700 }}>{item.title}</div>
            <p style={muted}>
              Programme: {item.program_id} · Provider: {item.source_type} · Licence: {item.license}
            </p>
            <a href={item.source_url} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>
              Open original dataset source ↗
            </a>
            <p style={muted}>DOI: {item.metadata?.doi || "Not supplied"}</p>
            <p style={muted}>
              Classes: {(item.metadata?.classes || []).join(", ") || "Not recorded"}
            </p>
          </div>
        ))}
      </section>

      <section style={panel}>
        <h2 style={heading}>Research audit history</h2>
        {audit.length === 0 ? (
          <p style={muted}>No audit events recorded yet.</p>
        ) : audit.map((event: AnyData) => (
          <div key={event.event_id} style={{
            padding: "11px 0",
            borderBottom: "1px solid #263449",
          }}>
            <div style={{ fontWeight: 650 }}>{event.event_type.replaceAll("_", " ")}</div>
            <div style={muted}>
              {event.created_at ? new Date(event.created_at).toLocaleString() : ""}
            </div>
            {event.details && (
              <div style={{ ...muted, fontSize: 12 }}>
                {Object.entries(event.details)
                  .filter(([key]) => !["invalid_sample"].includes(key))
                  .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
                  .join(" · ")}
              </div>
            )}
          </div>
        ))}
      </section>

      <p style={{ ...muted, marginTop: 22 }}>
        Scientific integrity: image sample verification is not complete archive verification.
        Training readiness is not proof of scientific validity. The independent validation
        dataset must remain separate from training. Current model-training code does not yet
        consume this independent validation directory. CYTOGENIX is a research and educational
        platform, not a clinically validated diagnostic system.
      </p>
    </main>
  );
}
