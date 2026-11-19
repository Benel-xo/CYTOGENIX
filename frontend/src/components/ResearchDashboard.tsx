"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./ResearchDashboard.module.css";

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000/api/v1";

type MicroscopyImage = {
  id: number | string;
  original_name: string;
  file_format?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  created_at?: string;
};

type Health = {
  status?: string;
  api?: string;
  database?: string;
  platform?: string;
};

const workspaces = [
  {
    number: "01",
    name: "Digital Microscopy",
    description: "Import, organise and inspect microscopy images.",
    href: "/workspaces/digital-microscopy",
    icon: "◉",
    category: "IMAGING",
  },
  {
    number: "02",
    name: "Image Quality & Processing",
    description: "Review image quality and prepare images for analysis.",
    href: "/workspaces/image-quality-processing",
    icon: "▧",
    category: "PROCESSING",
  },
  {
    number: "03",
    name: "Tissue Segmentation",
    description: "Explore tissue regions and segmentation overlays.",
    href: "/workspaces/tissue-segmentation",
    icon: "◫",
    category: "TISSUE ANALYSIS",
  },
  {
    number: "04",
    name: "Cellular Intelligence",
    description: "Explore cell-level measurements and visual outputs.",
    href: "/workspaces/cellular-intelligence",
    icon: "✳",
    category: "CELLULAR ANALYSIS",
  },
  {
    number: "05",
    name: "Nuclear Morphometry",
    description: "Examine nuclear morphology and measurements.",
    href: "/workspaces/nuclear-morphometry",
    icon: "◎",
    category: "MORPHOMETRY",
  },
  {
    number: "06",
    name: "Research Analysis",
    description: "Run the integrated research image-analysis workflow.",
    href: "/workspaces/research-analysis",
    icon: "⌁",
    category: "INTEGRATED ANALYSIS",
  },
];

function formatDate(value?: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes?: number) {
  if (!bytes || bytes <= 0) return "Size unavailable";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResearchDashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [images, setImages] = useState<MicroscopyImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setApiError("");

      const [healthResult, imagesResult] = await Promise.allSettled([
        fetch(`${API}/health`, { cache: "no-store" }),
        fetch(`${API}/microscopy/images`, { cache: "no-store" }),
      ]);

      if (!active) return;

      if (healthResult.status === "fulfilled" && healthResult.value.ok) {
        try {
          setHealth(await healthResult.value.json());
        } catch {
          setHealth(null);
        }
      } else {
        setHealth(null);
        setApiError("The API could not be reached.");
      }

      if (imagesResult.status === "fulfilled" && imagesResult.value.ok) {
        try {
          const data = await imagesResult.value.json();
          setImages(Array.isArray(data) ? data : data.images || []);
        } catch {
          setImages([]);
        }
      } else {
        setImages([]);
        setApiError((current) =>
          current
            ? `${current} The microscopy image list could not be loaded.`
            : "The microscopy image list could not be loaded."
        );
      }

      if (active) setLoading(false);
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  const recentImages = useMemo(
    () =>
      [...images].sort((a, b) => {
        const first = a.created_at ? new Date(a.created_at).getTime() : 0;
        const second = b.created_at ? new Date(b.created_at).getTime() : 0;
        return second - first;
      }),
    [images]
  );

  const weeklyActivity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return {
        key: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString([], { weekday: "short" }),
        count: 0,
      };
    });

    images.forEach((image) => {
      if (!image.created_at) return;
      const date = new Date(image.created_at);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      const day = days.find((item) => item.key === key);
      if (day) day.count += 1;
    });

    return days;
  }, [images]);

  const maxActivity = Math.max(1, ...weeklyActivity.map((day) => day.count));
  const databaseOnline = health?.database === "connected";
  const apiOnline = health?.status === "healthy" || health?.api === "online";

  return (
    <main className={styles.dashboard}>
      <div className={styles.topline}>
        <div>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            RESEARCH ENVIRONMENT
          </div>
          <h1>Cancer Analysis Dashboard</h1>
          <p className={styles.subtitle}>
            Your central workspace for digital microscopy and computational
            tissue research.
          </p>
        </div>
        <div className={styles.topActions}>
          <span className={styles.edition}>CYTOGENIX · RESEARCH EDITION</span>
          <button
            className={styles.refreshButton}
            onClick={() => window.location.reload()}
            type="button"
          >
            ↻ <span>Refresh</span>
          </button>
        </div>
      </div>

      <section className={styles.welcomePanel}>
        <div className={styles.welcomeContent}>
          <div className={styles.welcomeLabel}>WELCOME TO CYTOGENIX</div>
          <h2>Explore cells. Understand cancer.</h2>
          <p>
            A unified environment for microscopy image management, image
            processing and computational pathology research.
          </p>
          <Link href="/workspaces/digital-microscopy" className={styles.primaryButton}>
            Open Digital Microscopy <span>→</span>
          </Link>
        </div>
        <div className={styles.welcomeArtwork} aria-hidden="true">
          <div className={`${styles.artRing} ${styles.artRingOne}`} />
          <div className={`${styles.artRing} ${styles.artRingTwo}`} />
          <div className={styles.artCore}>C</div>
          <span className={styles.artLabel}>DIGITAL PATHOLOGY</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <div className={styles.sectionEyebrow}>AT A GLANCE</div>
            <h2>Research overview</h2>
          </div>
          <span className={styles.updatedLabel}>
            {loading ? "Updating…" : "Live system information"}
          </span>
        </div>

        <div className={styles.statsGrid}>
          <article className={styles.statCard}>
            <div className={styles.statTop}>
              <span className={styles.statIcon}>▧</span>
              <span className={styles.statCategory}>IMAGE REPOSITORY</span>
            </div>
            <div className={styles.statValue}>
              {loading ? "—" : images.length}
            </div>
            <div className={styles.statName}>Registered images</div>
            <div className={styles.statFoot}>Microscopy image collection</div>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statTop}>
              <span className={styles.statIcon}>⌘</span>
              <span className={styles.statCategory}>APPLICATION</span>
            </div>
            <div className={styles.statusLine}>
              <span className={`${styles.statusDot} ${apiOnline ? styles.online : styles.offline}`} />
              {loading ? "Checking" : apiOnline ? "Online" : "Unavailable"}
            </div>
            <div className={styles.statName}>API status</div>
            <div className={styles.statFoot}>CYTOGENIX application service</div>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statTop}>
              <span className={styles.statIcon}>▤</span>
              <span className={styles.statCategory}>DATA STORAGE</span>
            </div>
            <div className={styles.statusLine}>
              <span className={`${styles.statusDot} ${databaseOnline ? styles.online : styles.offline}`} />
              {loading ? "Checking" : databaseOnline ? "Connected" : "Unavailable"}
            </div>
            <div className={styles.statName}>Database status</div>
            <div className={styles.statFoot}>Research data connection</div>
          </article>

          <article className={styles.statCard}>
            <div className={styles.statTop}>
              <span className={styles.statIcon}>◷</span>
              <span className={styles.statCategory}>LATEST ACTIVITY</span>
            </div>
            <div className={styles.latestValue}>
              {loading
                ? "—"
                : recentImages[0]
                  ? formatDate(recentImages[0].created_at).split(",")[0]
                  : "No uploads"}
            </div>
            <div className={styles.statName}>Latest image upload</div>
            <div className={styles.statFoot}>
              {recentImages[0]?.original_name || "Your recent uploads will appear here"}
            </div>
          </article>
        </div>
      </section>

      {apiError && (
        <div className={styles.notice}>
          <strong>Connection notice</strong>
          <span>{apiError}</span>
        </div>
      )}

      <div className={styles.contentGrid}>
        <section className={styles.activityPanel}>
          <div className={styles.panelHeading}>
            <div>
              <div className={styles.sectionEyebrow}>IMAGE REPOSITORY</div>
              <h2>Recent microscopy images</h2>
            </div>
            <Link href="/workspaces/digital-microscopy" className={styles.textLink}>
              View repository →
            </Link>
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading image repository…</div>
          ) : recentImages.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>▧</div>
              <strong>No microscopy images yet</strong>
              <p>Import an image to begin building your research collection.</p>
              <Link href="/workspaces/digital-microscopy" className={styles.inlineButton}>
                Import an image →
              </Link>
            </div>
          ) : (
            <div className={styles.imageList}>
              {recentImages.slice(0, 5).map((image) => (
                <div className={styles.imageRow} key={image.id}>
                  <div className={styles.fileIcon}>▧</div>
                  <div className={styles.fileDetails}>
                    <strong>{image.original_name}</strong>
                    <span>
                      {image.width && image.height
                        ? `${image.width} × ${image.height} px`
                        : "Image dimensions unavailable"}
                      {" · "}
                      {formatSize(image.size_bytes)}
                    </span>
                  </div>
                  <div className={styles.fileDate}>
                    {formatDate(image.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.activityChartPanel}>
          <div className={styles.panelHeading}>
            <div>
              <div className={styles.sectionEyebrow}>UPLOAD HISTORY</div>
              <h2>Image activity</h2>
            </div>
            <span className={styles.chartCaption}>Last 7 days</span>
          </div>
          <div className={styles.chart}>
            {weeklyActivity.map((day) => (
              <div className={styles.chartColumn} key={day.key}>
                <span className={styles.chartCount}>{day.count || ""}</span>
                <div className={styles.chartTrack}>
                  <div
                    className={styles.chartBar}
                    style={{
                      height: `${day.count ? Math.max(8, (day.count / maxActivity) * 100) : 3}%`,
                    }}
                  />
                </div>
                <span className={styles.chartDay}>{day.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.chartFoot}>
            <span><i className={styles.legendDot} /> Registered image uploads</span>
            <strong>{images.length} total</strong>
          </div>
        </section>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <div className={styles.sectionEyebrow}>YOUR RESEARCH TOOLS</div>
            <h2>Cancer analysis workspaces</h2>
            <p className={styles.sectionDescription}>
              Move from image import to computational analysis in one connected environment.
            </p>
          </div>
        </div>

        <div className={styles.workspaceGrid}>
          {workspaces.map((workspace) => (
            <Link
              href={workspace.href}
              className={styles.workspaceCard}
              key={workspace.number}
            >
              <div className={styles.workspaceTop}>
                <span className={styles.workspaceIcon}>{workspace.icon}</span>
                <span className={styles.workspaceNumber}>{workspace.number}</span>
              </div>
              <span className={styles.workspaceCategory}>{workspace.category}</span>
              <h3>{workspace.name}</h3>
              <p>{workspace.description}</p>
              <span className={styles.workspaceArrow}>Open workspace <b>↗</b></span>
            </Link>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>CYTOGENIX <span className={styles.footerDivider}>/</span> RESEARCH EDITION</span>
        <span>Computational microscopy research environment</span>
      </footer>
    </main>
  );
}
