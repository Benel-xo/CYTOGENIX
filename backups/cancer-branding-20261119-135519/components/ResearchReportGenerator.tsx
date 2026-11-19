"use client";

type ReportRun = Record<string, unknown> | undefined;

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

function pretty(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function getAsset(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  if (/^https?:\/\//i.test(value)) return value;

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
  return String(run?.run_id || run?.report_id || "Not available");
}

export default function ResearchReportGenerator(props: Props) {
  const runs = [
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
            <h2>${index + 1}. ${escapeHtml(item.title)}</h2>
            <p>${escapeHtml(item.description)}</p>
            <p class="missing">No completed result is available for this stage.</p>
          </section>`;
      }

      const assets = item.assets
        .map(([label, path]) => {
          const url = getAsset(path);
          if (!url) return "";
          return `
            <figure>
              <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}">
              <figcaption>${escapeHtml(label)}</figcaption>
            </figure>`;
        })
        .join("");

      return `
        <section class="analysis">
          <h2>${index + 1}. ${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.description)}</p>
          <p class="runid">Run ID: ${escapeHtml(runId(item.run))}</p>
          ${assets ? `<div class="images">${assets}</div>` : ""}
          <h3>Recorded analysis output</h3>
          <pre>${escapeHtml(pretty(item.run))}</pre>
        </section>`;
    }).join("");

    const sourceImage = escapeHtml(props.imageUrl);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CYTOGENIX Research Analysis Report</title>
<style>
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#202b35;background:#fff;margin:0;padding:34px;line-height:1.55}
header{border-bottom:3px solid #253f52;padding-bottom:22px;margin-bottom:28px}
.brand{font-size:12px;letter-spacing:3px;color:#477080;font-weight:bold}
h1{font-size:30px;margin:12px 0 5px;color:#173448}
.subtitle{color:#60717d;font-size:14px}
h2{font-size:20px;color:#173f55;border-bottom:1px solid #dce4e9;padding-bottom:9px;margin-top:0}
h3{font-size:14px;color:#38576a;margin-top:22px}
section{margin:28px 0;break-inside:avoid}
.metadata{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0}
.meta{background:#f3f6f8;padding:12px;border-radius:5px;overflow-wrap:anywhere}
.meta strong{display:block;font-size:11px;color:#667984;text-transform:uppercase;letter-spacing:1px}
.meta span{font-size:14px}
.source-image{max-width:100%;max-height:430px;object-fit:contain;display:block;margin:15px auto;border:1px solid #dce4e9}
.images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0}
figure{margin:0;break-inside:avoid}
figure img{width:100%;max-height:280px;object-fit:contain;border:1px solid #dce4e9}
figcaption{font-size:12px;color:#60717d;margin-top:5px}
.runid{font-size:11px;color:#667984;overflow-wrap:anywhere}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6f8;border:1px solid #e0e6ea;border-radius:5px;padding:15px;font:11px/1.5 Menlo,monospace}
.missing{color:#8a5c35;background:#fff7ed;padding:12px}
.notice{background:#f2f6f8;border-left:4px solid #58798b;padding:17px;margin-top:25px}
footer{border-top:1px solid #dce4e9;padding-top:15px;margin-top:35px;color:#71808a;font-size:11px}
.actions{position:sticky;top:0;background:white;padding:12px 0;border-bottom:1px solid #ddd;margin-bottom:20px}
button{background:#173f55;color:white;border:0;padding:12px 20px;border-radius:5px;font-size:14px;cursor:pointer}
@media print{
 body{padding:0;font-size:11px}
 .actions{display:none}
 header{margin-top:0}
 section{break-inside:auto}
 figure,pre,.metadata{break-inside:avoid}
 h2{break-after:avoid}
}
</style>
</head>
<body>
<div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
<header>
<div class="brand">CYTOGENIX · RESEARCH EDITION</div>
<h1>Integrated Research Analysis Report</h1>
<div class="subtitle">Computational Cytology and Intelligent Histopathology Research Platform</div>
</header>

<section>
<h2>1. Research record</h2>
<div class="metadata">
<div class="meta"><strong>Source image</strong><span>${escapeHtml(image.original_name)}</span></div>
<div class="meta"><strong>Image ID</strong><span>${escapeHtml(image.id)}</span></div>
<div class="meta"><strong>Image format</strong><span>${escapeHtml(image.file_format || "Not specified")}</span></div>
<div class="meta"><strong>Image dimensions</strong><span>${image.width && image.height ? `${escapeHtml(image.width)} × ${escapeHtml(image.height)} pixels` : "Not recorded"}</span></div>
<div class="meta"><strong>Completed stages</strong><span>${completed} of 6</span></div>
<div class="meta"><strong>Report generated</strong><span>${escapeHtml(generatedAt)}</span></div>
</div>
<img class="source-image" src="${sourceImage}" alt="Original microscopy image">
</section>

${sections}

<section class="notice">
<h2>Scientific scope, methods and limitations</h2>
<p>This report records outputs returned by the CYTOGENIX research analysis services. Colour thresholding, morphological processing and connected-component methods produce candidate regions; they do not establish verified biological cell identities, tumour identities or cancer diagnoses.</p>
<p>Nuclear morphometry and spatial analysis are derived from candidate regions generated by earlier processing stages. Tumour Microenvironment is an independent heuristic analysis branch. Candidate regions may include artefacts or non-target structures.</p>
<p>Measurements may be based on analysis pixels and must not be interpreted as physical micrometre measurements without appropriate image calibration. These methods are not clinically validated and must not be used for screening, diagnosis, treatment selection or patient management.</p>
<p>Missing stages are explicitly identified in this report. No missing measurements, predictions, confidence values or diagnostic findings have been fabricated.</p>
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
        Generate a printable report using the actual results currently displayed
        in this analysis session. Completed and incomplete stages are identified
        separately.
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
