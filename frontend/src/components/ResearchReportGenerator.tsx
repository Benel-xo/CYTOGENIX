"use client";

type ReportRun = Record<string, unknown> | undefined;
type Asset = [string, unknown];

type Props = {
  image?: {
    id: string;
    original_name: string;
    file_format?: string;
    width?: number;
    height?: number;
    created_at?: string;
  };
  imageUrl: string;
  quality?: ReportRun;
  segmentation?: ReportRun;
  cellular?: ReportRun;
  morphometry?: ReportRun;
  spatial?: ReportRun;
  microenvironment?: ReportRun;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function labelOf(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getAsset(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";

  const api = (
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1"
  ).replace(/\/$/, "");

  try {
    return new URL(value, api).toString();
  } catch {
    return "";
  }
}

function runId(run?: ReportRun): string {
  return String(
    run?.run_id ||
    run?.report_id ||
    run?.morphometry_run_id ||
    run?.analysis_run_id ||
    "Not available"
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "Not recorded";
  return String(value);
}

function isImageField(key: string, value: unknown): boolean {
  if (typeof value !== "string") return false;

  const k = key.toLowerCase();
  return (
    /(image|overlay|mask|density|compartment|heatmap|visual|thumbnail|preview)/.test(k) &&
    /(url|path|image|overlay|mask|map|file|visual)/.test(k)
  );
}

function collectImages(
  value: unknown,
  prefix = "",
  output: Asset[] = [],
  seen = new Set<string>()
): Asset[] {
  if (!value || typeof value !== "object") return output;

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectImages(entry, `${prefix} ${index + 1}`, output, seen);
    });
    return output;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isImageField(key, child)) {
      const url = getAsset(child);
      if (url && !seen.has(url)) {
        seen.add(url);
        output.push([labelOf(key), url]);
      }
    } else if (child && typeof child === "object") {
      collectImages(child, `${prefix} ${labelOf(key)}`, output, seen);
    }
  }

  return output;
}

function renderData(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "";

  if (Array.isArray(value)) {
    if (!value.length) return "";

    if (value.every((entry) => entry === null || typeof entry !== "object")) {
      return `
        <div class="value-list">
          ${value.slice(0, 60).map((entry) =>
            `<span>${escapeHtml(formatValue(entry))}</span>`
          ).join("")}
        </div>`;
    }

    const objects = value.filter(
      (entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    ) as Record<string, unknown>[];

    if (objects.length) {
      const columns = Array.from(
        new Set(objects.flatMap((entry) => Object.keys(entry)))
      ).filter((key) => !/url|path|image|mask|overlay/i.test(key)).slice(0, 8);

      if (columns.length) {
        return `
          <div class="table-wrap">
            <table>
              <thead><tr>${columns.map((key) =>
                `<th>${escapeHtml(labelOf(key))}</th>`
              ).join("")}</tr></thead>
              <tbody>
                ${objects.slice(0, 100).map((entry) => `
                  <tr>${columns.map((key) =>
                    `<td>${escapeHtml(formatValue(entry[key]))}</td>`
                  ).join("")}</tr>
                `).join("")}
              </tbody>
            </table>
          </div>`;
      }
    }

    return "";
  }

  if (typeof value !== "object") {
    return `<div class="data-value">${escapeHtml(formatValue(value))}</div>`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, child]) => {
      if (child === undefined || child === null) return false;
      if (isImageField(key, child)) return false;
      if (/^(run_id|report_id|image_id|created_at|updated_at|filename|stored_name)$/i.test(key)) return false;
      return true;
    });

  if (!entries.length) return "";

  const numeric = entries.filter(
    ([, child]) => typeof child === "number" && Number.isFinite(child)
  );

  const other = entries.filter(
    ([, child]) => typeof child !== "number"
  );

  let html = "";

  if (numeric.length) {
    html += `
      <div class="metric-grid">
        ${numeric.map(([key, child]) => `
          <div class="metric">
            <div class="metric-label">${escapeHtml(labelOf(key))}</div>
            <div class="metric-value">${escapeHtml(formatValue(child))}</div>
          </div>
        `).join("")}
      </div>`;
  }

  for (const [key, child] of other) {
    if (typeof child === "object" && child !== null) {
      if (depth >= 5) continue;

      const nested = renderData(child, depth + 1);
      if (!nested) continue;

      html += `
        <div class="data-group">
          <h4>${escapeHtml(labelOf(key))}</h4>
          ${nested}
        </div>`;
    } else {
      html += `
        <div class="detail-row">
          <span>${escapeHtml(labelOf(key))}</span>
          <strong>${escapeHtml(formatValue(child))}</strong>
        </div>`;
    }
  }

  return html;
}

export default function ResearchReportGenerator(props: Props) {
  const runs: {
    title: string;
    run: ReportRun;
    description: string;
    assets: Asset[];
  }[] = [
    {
      title: "Image Quality & Processing",
      run: props.quality,
      description: "Image-level quality and preparation measurements.",
      assets: [],
    },
    {
      title: "Tissue Segmentation",
      run: props.segmentation,
      description: "Heuristic separation of tissue and background regions.",
      assets: [
        ["Segmentation overlay", props.segmentation?.overlay_url],
        ["Segmentation mask", props.segmentation?.mask_url],
      ],
    },
    {
      title: "Cellular Intelligence",
      run: props.cellular,
      description: "Colour- and morphology-based candidate-region detection.",
      assets: [
        ["Cellular detection overlay", props.cellular?.overlay_url],
        ["Candidate-region mask", props.cellular?.mask_url],
      ],
    },
    {
      title: "Nuclear Morphometry",
      run: props.morphometry,
      description: "Geometric measurements derived from the saved cellular candidate mask.",
      assets: [],
    },
    {
      title: "Spatial Analysis",
      run: props.spatial,
      description: "Spatial distribution and clustering of candidate regions.",
      assets: [
        ["Spatial distribution overlay", props.spatial?.overlay_url],
        ["Spatial density map", props.spatial?.density_url],
      ],
    },
    {
      title: "Tumour Microenvironment",
      run: props.microenvironment,
      description: "Independent colour-heuristic tissue-context analysis.",
      assets: [
        ["Microenvironment overlay", props.microenvironment?.overlay_url],
        ["Compartment map", props.microenvironment?.compartments_url],
        ["Immune-like candidate mask", props.microenvironment?.immune_mask_url],
      ],
    },
  ];

  const completed = runs.filter((item) => item.run).length;

  function generateReport() {
    if (!props.image || completed === 0) return;

    const generatedAt = new Date().toLocaleString();
    const image = props.image;

    const sections = runs.map((item, index) => {
      if (!item.run) {
        return `
          <section class="analysis">
            <div class="section-number">STAGE ${String(index + 1).padStart(2, "0")}</div>
            <h2>${escapeHtml(item.title)}</h2>
            <p>${escapeHtml(item.description)}</p>
            <p class="missing">No completed result is available for this stage.</p>
          </section>`;
      }

      const allAssets: Asset[] = [...item.assets, ...collectImages(item.run)];
      const seen = new Set<string>();

      const assets = allAssets
        .map(([label, path]) => {
          const url = typeof path === "string" && /^https?:\/\//i.test(path)
            ? path
            : getAsset(path);

          if (!url || seen.has(url)) return "";
          seen.add(url);

          return `
            <figure>
              <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}"
                   onerror="this.parentElement.classList.add('image-error');this.style.display='none'">
              <figcaption>${escapeHtml(label)}</figcaption>
            </figure>`;
        })
        .join("");

      const result = renderData(item.run);

      return `
        <section class="analysis">
          <div class="section-number">STAGE ${String(index + 1).padStart(2, "0")}</div>
          <h2>${escapeHtml(item.title)}</h2>
          <p class="description">${escapeHtml(item.description)}</p>
          <p class="runid">Run ID: ${escapeHtml(runId(item.run))}</p>

          ${assets ? `
            <h3>Visual analysis results</h3>
            <div class="images">${assets}</div>
          ` : ""}

          <h3>Analysis measurements and findings</h3>
          ${result || '<p class="missing">No structured measurements were returned for this stage.</p>'}
        </section>`;
    }).join("");

    const sourceImage = escapeHtml(getAsset(props.imageUrl));

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CYTOGENIX Research Analysis Report</title>
<style>
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#202b35;background:#fff;margin:0;padding:34px;line-height:1.6}
header{border-bottom:3px solid #253f52;padding-bottom:22px;margin-bottom:28px}
.brand{font-size:12px;letter-spacing:3px;color:#477080;font-weight:bold}
h1{font-size:30px;margin:12px 0 5px;color:#173448}
.subtitle{color:#60717d;font-size:14px}
h2{font-size:21px;color:#173f55;border-bottom:1px solid #dce4e9;padding-bottom:10px;margin:5px 0 12px}
h3{font-size:14px;color:#38576a;margin:24px 0 12px}
h4{font-size:13px;color:#31576a;margin:18px 0 10px}
section{margin:30px 0;break-inside:auto}
.section-number{font-size:10px;font-weight:bold;letter-spacing:2px;color:#5a8993;margin-bottom:5px}
.description{color:#657783;font-size:13px}
.metadata{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0}
.meta{background:#f3f6f8;padding:13px;border-radius:5px;overflow-wrap:anywhere}
.meta strong{display:block;font-size:10px;color:#667984;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
.meta span{font-size:13px}
.source-image{width:100%;max-width:950px;max-height:580px;object-fit:contain;display:block;margin:20px auto;border:1px solid #dce4e9;background:#f5f7f8}
.images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:18px 0}
figure{margin:0;min-width:0;break-inside:avoid;background:#f6f8fa;border:1px solid #e0e6ea;border-radius:7px;padding:10px}
figure img{width:100%;height:350px;object-fit:contain;display:block;background:#fff;border-radius:4px}
figcaption{font-size:12px;color:#526c7b;margin-top:9px;font-weight:bold}
.runid{font-size:10px;color:#84919a;overflow-wrap:anywhere}
.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;margin:14px 0}
.metric{background:#f1f6f7;border:1px solid #e0e9eb;border-radius:7px;padding:14px;min-width:0}
.metric-label{font-size:10px;color:#667984;text-transform:uppercase;letter-spacing:.7px;overflow-wrap:anywhere}
.metric-value{font-size:22px;font-weight:bold;color:#1b5360;margin-top:5px;overflow-wrap:anywhere}
.data-group{margin:15px 0;padding:14px;background:#fafbfc;border:1px solid #e5eaed;border-radius:6px}
.data-group h4{margin-top:0}
.detail-row{display:flex;justify-content:space-between;gap:20px;padding:9px 11px;border-bottom:1px solid #e9edef;font-size:12px}
.detail-row span{color:#667984}
.detail-row strong{text-align:right;overflow-wrap:anywhere;color:#263d4a}
.value-list{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}
.value-list span{background:#edf3f5;padding:6px 10px;border-radius:4px;font-size:11px}
.table-wrap{overflow-x:auto;margin:12px 0}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#eaf0f3;color:#355466;text-align:left;padding:10px}
td{padding:9px;border-bottom:1px solid #e4e9ec;overflow-wrap:anywhere}
.missing{color:#8a5c35;background:#fff7ed;padding:12px;border-radius:5px}
.image-error{display:none}
.notice{background:#f2f6f8;border-left:4px solid #58798b;padding:17px;margin-top:25px}
footer{border-top:1px solid #dce4e9;padding-top:15px;margin-top:35px;color:#71808a;font-size:11px}
.actions{position:sticky;top:0;background:white;padding:12px 0;border-bottom:1px solid #ddd;margin-bottom:20px;z-index:2}
button{background:#173f55;color:white;border:0;padding:12px 20px;border-radius:5px;font-size:14px;cursor:pointer}
@media(max-width:700px){
 body{padding:17px}
 h1{font-size:24px}
 .metadata,.images{grid-template-columns:1fr}
 .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 figure img{height:280px}
 .detail-row{flex-direction:column;gap:4px}
 .detail-row strong{text-align:left}
}
@media print{
 body{padding:0;font-size:11px}
 .actions{display:none}
 header{margin-top:0}
 section{break-inside:auto}
 figure,.metric,.metadata,.data-group,table{break-inside:avoid}
 h2,h3,h4{break-after:avoid}
 figure img{height:300px}
}
</style>
</head>
<body>
<div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>

<header>
<div class="brand">CYTOGENIX · RESEARCH EDITION</div>
<h1>Integrated Cancer Analysis Report</h1>
<div class="subtitle">Computational Cytology and Intelligent Histopathology Cancer Analysis Platform</div>
</header>

<section>
<div class="section-number">RESEARCH RECORD</div>
<h2>Specimen and analysis overview</h2>
<div class="metadata">
<div class="meta"><strong>Source image</strong><span>${escapeHtml(image.original_name)}</span></div>
<div class="meta"><strong>Image ID</strong><span>${escapeHtml(image.id)}</span></div>
<div class="meta"><strong>Image format</strong><span>${escapeHtml(image.file_format || "Not specified")}</span></div>
<div class="meta"><strong>Image dimensions</strong><span>${image.width && image.height ? `${escapeHtml(image.width)} × ${escapeHtml(image.height)} pixels` : "Not recorded"}</span></div>
<div class="meta"><strong>Completed stages</strong><span>${completed} of 6</span></div>
<div class="meta"><strong>Report generated</strong><span>${escapeHtml(generatedAt)}</span></div>
</div>
<img class="source-image" src="${sourceImage}" alt="Original microscopy image"
     onerror="this.style.display='none'">
</section>

${sections}

<section class="notice">
<h2>Scientific scope, methods and limitations</h2>
<p>This report records outputs returned by the CYTOGENIX research analysis services. Colour thresholding, morphological processing and connected-component methods produce candidate regions; they do not establish verified biological cell identities, tumour identities or cancer diagnoses.</p>
<p>Nuclear morphometry and spatial analysis are derived from candidate regions generated by earlier processing stages. Tumour Microenvironment is an independent heuristic analysis branch. Candidate regions may include artefacts or non-target structures.</p>
<p>Measurements may be based on analysis pixels and must not be interpreted as physical micrometre measurements without appropriate image calibration. These methods are not clinically validated and must not be used for screening, diagnosis, treatment selection or patient management.</p>
<p>Missing stages are explicitly identified. No missing measurements, predictions, confidence values or diagnostic findings have been fabricated.</p>
</section>

<footer>
CYTOGENIX · Research and educational use only · Generated ${escapeHtml(generatedAt)}
</footer>
</body>
</html>`;

    const reportWindow = window.open("", "_blank");

    if (!reportWindow) {
      alert("The report window was blocked. Allow pop-ups for this site and try again.");
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
  }

  return (
    <section style={{
      marginTop: 28,
      padding: 24,
      border: "1px solid #dce4e9",
      borderRadius: 12,
      background: "#fff"
    }}>
      <div style={{
        fontSize: 11,
        letterSpacing: 2,
        fontWeight: 700,
        color: "#58798b",
        marginBottom: 9
      }}>
        CYTOGENIX / REPORTING
      </div>
      <h2 style={{ fontSize: 23, margin: "0 0 8px", color: "#173448" }}>
        Research Report Generator
      </h2>
      <p style={{ color: "#657783", fontSize: 14, lineHeight: 1.6 }}>
        Generate a formatted research report containing the actual results,
        measurements and visual outputs from this analysis session.
      </p>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        marginTop: 18
      }}>
        <span style={{ fontSize: 13, color: "#536875" }}>
          {completed} of 6 analysis stages have results
        </span>
        <button
          type="button"
          onClick={generateReport}
          disabled={!props.image || completed === 0}
          style={{
            background: !props.image || completed === 0 ? "#aab7bf" : "#173f55",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            padding: "13px 20px",
            fontWeight: 700,
            cursor: !props.image || completed === 0 ? "not-allowed" : "pointer"
          }}
        >
          Generate Research Report ↗
        </button>
      </div>
      <p style={{ fontSize: 12, color: "#75848d", marginTop: 13 }}>
        In the report window, choose Print and then Save as PDF to export your report.
      </p>
    </section>
  );
}
