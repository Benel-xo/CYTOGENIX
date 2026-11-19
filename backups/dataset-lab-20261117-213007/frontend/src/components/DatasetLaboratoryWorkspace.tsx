"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./DatasetLaboratoryWorkspace.module.css";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type DatasetSnapshot = {
  directory: string;
  folder_exists: boolean;
  image_count: number;
  class_count: number;
  classes: { name: string; image_count: number }[];
  available: boolean;
  ready_for_basic_training: boolean;
};

type Overview = {
  registry: {
    project: string;
    registry_version: string;
    programme_name: string;
    dataset_title: string;
    source: {
      provider: string;
      record_url: string;
      doi: string;
      source_license: string;
    };
    training_dataset: {
      filename: string;
      download_url: string;
      approximate_size: string;
      md5: string;
      intended_use: string;
    };
    validation_dataset: {
      filename: string;
      download_url: string;
      approximate_size: string;
      image_count: number;
      md5: string;
      intended_use: string;
    };
    total_approximate_download: string;
    tissue_classes: string[];
    scientific_notes: string[];
  };
  registry_connection: {
    source: string;
    cloud_repository: string;
    cloud_registry_url: string;
    warning: string | null;
  };
  local_datasets: {
    training: DatasetSnapshot;
    validation: DatasetSnapshot;
  };
  research_integrity: {
    validation_separate_from_training: boolean;
    validation_used_for_training: boolean;
    clinical_validation_claimed: boolean;
  };
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`${styles.status} ${ok ? styles.good : styles.pending}`}>
      <span className={styles.statusDot} />
      {children}
    </span>
  );
}

function DatasetCard({
  title,
  subtitle,
  snapshot,
  intendedUse,
}: {
  title: string;
  subtitle: string;
  snapshot: DatasetSnapshot;
  intendedUse: string;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelTop}>
        <div>
          <div className={styles.eyebrow}>LOCAL DATASET INSPECTION</div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <Status ok={snapshot.available}>
          {snapshot.available ? "Images detected" : "Not downloaded / extracted"}
        </Status>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span>IMAGE FILES FOUND</span>
          <strong>{formatNumber(snapshot.image_count)}</strong>
        </div>
        <div className={styles.metric}>
          <span>CLASSES FOUND</span>
          <strong>{snapshot.class_count}</strong>
        </div>
      </div>

      <div className={styles.pathBox}>
        <span>LOCAL DIRECTORY</span>
        <code>{snapshot.directory}</code>
        <small>{snapshot.folder_exists ? "Folder exists" : "Folder not found"}</small>
      </div>

      <div className={styles.useRow}>
        <span>Intended use</span>
        <strong>{intendedUse}</strong>
      </div>

      {snapshot.classes.length > 0 && (
        <div className={styles.classList}>
          <h3>Detected class folders</h3>
          {snapshot.classes.map((item) => (
            <div className={styles.classRow} key={item.name}>
              <span>{item.name}</span>
              <strong>{formatNumber(item.image_count)}</strong>
            </div>
          ))}
        </div>
      )}

      {title.toLowerCase().includes("training") && (
        <div className={styles.readiness}>
          <Status ok={snapshot.ready_for_basic_training}>
            {snapshot.ready_for_basic_training
              ? "Basic structural checks passed"
              : "Not ready for basic training"}
          </Status>
          <p>
            This is only a folder-structure check. It does not establish
            dataset integrity, patient-level separation, or scientific validity.
          </p>
        </div>
      )}

      {!snapshot.available && (
        <p className={styles.emptyNote}>
          No image files were detected in this directory. The cloud registry
          lists the dataset, but that does not mean the archive is stored locally.
        </p>
      )}
    </section>
  );
}

export default function DatasetLaboratoryWorkspace() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/dataset-laboratory/overview`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `API error ${response.status}`);
      }

      const result: Overview = await response.json();
      setData(result);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to the CYTOGENIX API."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  if (loading && !data) {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>Connecting to the dataset registry...</div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className={styles.page}>
        <header className={styles.heading}>
          <div className={styles.eyebrow}>WORKSPACE 13 / 15</div>
          <h1>Dataset Laboratory</h1>
          <p>Dataset registry, local availability and research provenance.</p>
        </header>
        <div className={styles.error}>
          <strong>Could not load the Dataset Laboratory</strong>
          <p>{error}</p>
          <button onClick={loadOverview}>Try again</button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const registry = data.registry;
  const cloudConnected =
    data.registry_connection.source === "huggingface";

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>WORKSPACE 13 / 15 · DATA MANAGEMENT</div>
          <h1>Dataset Laboratory</h1>
          <p>
            A central workspace for dataset registration, local inspection,
            provenance and research data integrity.
          </p>
        </div>
        <button
          className={styles.refresh}
          onClick={loadOverview}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "↻ Refresh registry"}
        </button>
      </header>

      <section className={styles.connectionPanel}>
        <div>
          <div className={styles.eyebrow}>CLOUD REGISTRY CONNECTION</div>
          <h2>Hugging Face Dataset Registry</h2>
          <p>
            Public registry: Ben0205 / cytogenix-research-data
          </p>
        </div>
        <Status ok={cloudConnected}>
          {cloudConnected ? "Cloud registry connected" : "Using local registry fallback"}
        </Status>
        <a
          href={data.registry_connection.cloud_repository}
          target="_blank"
          rel="noreferrer"
        >
          Open repository ↗
        </a>
      </section>

      {data.registry_connection.warning && (
        <div className={styles.warning}>
          {data.registry_connection.warning}. The local manifest is being used.
        </div>
      )}

      {error && (
        <div className={styles.warning}>
          The latest refresh failed. Displaying the last successfully loaded data.
          {` ${error}`}
        </div>
      )}

      <section className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span>REGISTERED PROGRAMME</span>
          <strong>{registry.programme_name}</strong>
          <small>Registry version {registry.registry_version}</small>
        </div>
        <div className={styles.summaryCard}>
          <span>REGISTERED DATASETS</span>
          <strong>2</strong>
          <small>Training + independent validation</small>
        </div>
        <div className={styles.summaryCard}>
          <span>EXPECTED TISSUE LABELS</span>
          <strong>{registry.tissue_classes.length}</strong>
          <small>Categories, not separate cancer types</small>
        </div>
        <div className={styles.summaryCard}>
          <span>ARCHIVE DOWNLOAD SIZE</span>
          <strong>{registry.total_approximate_download}</strong>
          <small>Original archives hosted by Zenodo</small>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.eyebrow}>REGISTERED DATA SOURCE</div>
        <h2>{registry.dataset_title}</h2>
        <p className={styles.description}>
          The registry references the original dataset archives. The archives
          themselves are not copied into the Hugging Face repository.
        </p>

        <div className={styles.sourceGrid}>
          <div>
            <span>ORIGINAL PROVIDER</span>
            <strong>{registry.source.provider}</strong>
          </div>
          <div>
            <span>DATASET LICENCE</span>
            <strong>{registry.source.source_license}</strong>
          </div>
          <div>
            <span>DOI</span>
            <strong>{registry.source.doi}</strong>
          </div>
        </div>

        <a
          className={styles.sourceLink}
          href={registry.source.record_url}
          target="_blank"
          rel="noreferrer"
        >
          View original Zenodo record ↗
        </a>
      </section>

      <div className={styles.sectionHeading}>
        <div>
          <div className={styles.eyebrow}>LOCAL STORAGE INSPECTION</div>
          <h2>Dataset availability on this Mac</h2>
        </div>
        <small>Last checked: {lastUpdated || "Not checked"}</small>
      </div>

      <div className={styles.datasetGrid}>
        <DatasetCard
          title="Training Dataset"
          subtitle={registry.training_dataset.filename}
          snapshot={data.local_datasets.training}
          intendedUse={registry.training_dataset.intended_use}
        />
        <DatasetCard
          title="Independent Validation Dataset"
          subtitle={registry.validation_dataset.filename}
          snapshot={data.local_datasets.validation}
          intendedUse={registry.validation_dataset.intended_use}
        />
      </div>

      <section className={styles.panel}>
        <div className={styles.panelTop}>
          <div>
            <div className={styles.eyebrow}>TISSUE CLASS REGISTRY</div>
            <h2>Registered tissue categories</h2>
            <p>These labels describe tissue categories in the colorectal dataset.</p>
          </div>
          <span className={styles.countTag}>
            {registry.tissue_classes.length} categories
          </span>
        </div>

        <div className={styles.tissueGrid}>
          {registry.tissue_classes.map((label) => (
            <div className={styles.tissueTag} key={label}>{label}</div>
          ))}
        </div>

        <p className={styles.classExplanation}>
          ADI, BACK, DEB, LYM, MUC, MUS, NORM, STR and TUM are nine tissue
          labels. They do not represent nine different cancer programmes.
        </p>
      </section>

      <section className={styles.panel}>
        <div className={styles.eyebrow}>DATASET ARCHIVE REFERENCES</div>
        <h2>Original download sources</h2>
        <div className={styles.archiveRow}>
          <div>
            <strong>{registry.training_dataset.filename}</strong>
            <span>{registry.training_dataset.approximate_size} · Training</span>
            <code>MD5: {registry.training_dataset.md5}</code>
          </div>
          <a href={registry.training_dataset.download_url} target="_blank" rel="noreferrer">
            Zenodo download ↗
          </a>
        </div>
        <div className={styles.archiveRow}>
          <div>
            <strong>{registry.validation_dataset.filename}</strong>
            <span>{registry.validation_dataset.approximate_size} · Independent validation</span>
            <code>MD5: {registry.validation_dataset.md5}</code>
          </div>
          <a href={registry.validation_dataset.download_url} target="_blank" rel="noreferrer">
            Zenodo download ↗
          </a>
        </div>
        <p className={styles.classExplanation}>
          These links point to the original Zenodo files. Opening a link may
          start a large download. The Dataset Laboratory does not download
          archives automatically.
        </p>
      </section>

      <section className={styles.integrityPanel}>
        <div className={styles.eyebrow}>RESEARCH INTEGRITY</div>
        <h2>Dataset handling rules</h2>
        <ul>
          {registry.scientific_notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          <li>
            The independent validation archive must not be included in model training.
          </li>
          <li>
            A dataset folder or image count does not establish patient-level separation.
          </li>
        </ul>
      </section>

      <footer className={styles.footerNote}>
        CYTOGENIX is an experimental biomedical research and educational platform.
        Its outputs are not intended for clinical diagnosis, screening, treatment
        decisions or patient management.
      </footer>
    </main>
  );
}
