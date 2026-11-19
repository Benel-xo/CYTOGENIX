import Link from "next/link";
import { notFound } from "next/navigation";

const workspaces: Record<string, { number: string; title: string; description: string; purpose: string[] }> = {
  "digital-microscopy": { number: "02", title: "Digital Microscopy", description: "A workspace for loading, viewing and inspecting digital pathology images.", purpose: ["Image upload and file validation", "Microscopy viewer development", "Image metadata inspection", "Slide navigation and viewing tools"] },
  "image-processing": { number: "03", title: "Image Quality & Processing", description: "Tools for image quality assessment, preprocessing and reproducible image preparation.", purpose: ["Image quality assessment", "Colour and stain normalisation research", "Image preprocessing pipelines", "Processing history and provenance"] },
  "cancer-classification": { number: "04", title: "Cancer AI Classification", description: "A research environment for developing and evaluating classification methods across ten cancer categories.", purpose: ["Breast cancer research", "Lung cancer research", "Colorectal cancer research", "Prostate cancer research", "Stomach cancer research", "Cervical cancer research", "Bladder cancer research", "Melanoma research", "Kidney cancer research", "Liver cancer research"] },
  "tissue-segmentation": { number: "05", title: "Tissue Segmentation", description: "Research tissue regions, segmentation pipelines and region-level measurements.", purpose: ["Tissue region identification", "Segmentation model experiments", "Mask inspection", "Region measurements"] },
  "cellular-intelligence": { number: "06", title: "Cellular Intelligence", description: "A framework for cellular detection, characterisation and computational analysis.", purpose: ["Cell detection research", "Cellular feature extraction", "Cell classification experiments", "Cell population summaries"] },
  "nuclear-morphometry": { number: "07", title: "Nuclear Morphometry", description: "Quantitative analysis of nuclear morphology and related image-derived measurements.", purpose: ["Nuclear detection", "Area and perimeter measurements", "Shape descriptors", "Pixel-to-micron calibration"] },
  "tumour-microenvironment": { number: "08", title: "Tumour Microenvironment", description: "Explore the spatial context of tissue and cellular neighbourhoods.", purpose: ["Cell neighbourhood analysis", "Spatial relationships", "Tissue context", "Microenvironment research"] },
  "spatial-analysis": { number: "09", title: "Spatial Analysis & Heterogeneity", description: "Study spatial organisation, regional variation and tissue heterogeneity.", purpose: ["Spatial distribution analysis", "Regional heterogeneity", "Distance measurements", "Spatial statistics"] },
  "explainable-ai": { number: "10", title: "Explainable AI", description: "Inspect and communicate model explanations and limitations.", purpose: ["Model explanation methods", "Saliency visualisation", "Feature attribution", "Explanation quality assessment"] },
  "model-laboratory": { number: "11", title: "Training & Model Laboratory", description: "Organise model development, experiment configurations and training workflows.", purpose: ["Model configuration", "Training experiments", "Experiment tracking", "Model version management"] },
  "evaluation": { number: "12", title: "Evaluation & Reliability", description: "Evaluate models with reproducible methods and transparent reporting.", purpose: ["Confusion matrices", "Sensitivity and specificity", "Calibration and uncertainty", "Patient-level data splitting", "External validation planning"] },
  "dataset-laboratory": { number: "13", title: "Dataset Laboratory", description: "Manage research datasets, metadata, annotations and data provenance.", purpose: ["Dataset registration", "Metadata management", "Annotation organisation", "Dataset quality checks", "Provenance tracking"] },
  "reports": { number: "14", title: "Reports & Publications", description: "Prepare transparent scientific reports and publication-ready research outputs.", purpose: ["Experiment reports", "Figures and tables", "Methods documentation", "Research export"] },
  "tissue-atlas": { number: "15", title: "Tissue Atlas & AI Research Assistant", description: "A knowledge workspace for tissue references and research assistance.", purpose: ["Tissue reference library", "Research knowledge organisation", "Scientific literature notes", "AI research assistant development"] },
};

export function generateStaticParams() {
  return Object.keys(workspaces).map((slug) => ({ slug }));
}

export default async function WorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const workspace = workspaces[slug];

  if (!workspace) notFound();

  return (
    <div className="workspace-detail">
      <Link href="/" className="back-link">← Back to research overview</Link>
      <div className="eyebrow">WORKSPACE {workspace.number} / 15 · DEVELOPMENT</div>
      <h1>{workspace.title}</h1>
      <p className="detail-description">{workspace.description}</p>

      <div className="detail-status"><span className="status-dot" /> FOUNDATION CREATED <span>·</span> FUNCTIONALITY UNDER DEVELOPMENT</div>

      <section className="detail-panel">
        <div className="panel-heading"><div><div className="eyebrow">MODULE SCOPE</div><h2>Planned capabilities</h2></div><span className="section-count">WORKSPACE {workspace.number}</span></div>
        <div className="capability-list">
          {workspace.purpose.map((item, index) => (
            <div className="capability-item" key={item}>
              <span className="capability-index">{String(index + 1).padStart(2, "0")}</span>
              <span>{item}</span>
              <span className="capability-arrow">↗</span>
            </div>
          ))}
        </div>
      </section>

      <section className="disclaimer">
        <div className="disclaimer-icon">i</div>
        <div><strong>Development status</strong><p>This workspace is currently a structural foundation. No functional AI prediction, validated model, clinical result or completed analysis is being claimed. Features will be implemented and tested in subsequent development stages.</p></div>
      </section>
    </div>
  );
}
