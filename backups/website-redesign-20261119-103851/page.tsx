import Link from "next/link";

const modules = [
  { n: "02", title: "Digital Microscopy", desc: "Explore and inspect digital pathology images.", href: "/workspaces/digital-microscopy", category: "IMAGING", icon: "◉" },
  { n: "03", title: "Image Quality & Processing", desc: "Image preparation, quality control and enhancement.", href: "/workspaces/image-processing", category: "IMAGING", icon: "▧" },
  { n: "04", title: "Cancer AI Classification", desc: "Research workflows across ten cancer categories.", href: "/workspaces/cancer-classification", category: "ARTIFICIAL INTELLIGENCE", icon: "⌘" },
  { n: "05", title: "Tissue Segmentation", desc: "Investigate tissue regions and segmentation methods.", href: "/workspaces/tissue-segmentation", category: "IMAGE ANALYSIS", icon: "⬡" },
  { n: "06", title: "Cellular Intelligence", desc: "Explore cellular features and computational analysis.", href: "/workspaces/cellular-intelligence", category: "CELLULAR ANALYSIS", icon: "◎" },
  { n: "07", title: "Nuclear Morphometry", desc: "Quantitative nuclear morphology measurements.", href: "/workspaces/nuclear-morphometry", category: "QUANTITATIVE ANALYSIS", icon: "◌" },
  { n: "08", title: "Tumour Microenvironment", desc: "Study tissue context and cellular neighbourhoods.", href: "/workspaces/tumour-microenvironment", category: "SPATIAL BIOLOGY", icon: "✳" },
  { n: "09", title: "Spatial Analysis", desc: "Investigate spatial patterns and tissue heterogeneity.", href: "/workspaces/spatial-analysis", category: "SPATIAL BIOLOGY", icon: "⌖" },
  { n: "10", title: "Explainable AI", desc: "Inspect model reasoning and visual explanations.", href: "/workspaces/explainable-ai", category: "ARTIFICIAL INTELLIGENCE", icon: "✧" },
  { n: "12", title: "Evaluation & Reliability", desc: "Assess model performance and reliability.", href: "/workspaces/evaluation", category: "MODEL VALIDATION", icon: "⌁" },
  { n: "13", title: "Dataset Laboratory", desc: "Organise datasets, provenance and annotations.", href: "/workspaces/dataset-laboratory", category: "DATA MANAGEMENT", icon: "▤" },
  { n: "14", title: "Reports & Publications", desc: "Prepare research reports and publication outputs.", href: "/workspaces/reports", category: "RESEARCH OUTPUT", icon: "▧" },
  { n: "15", title: "Tissue Atlas & AI Assistant", desc: "Explore a research atlas and assistance workspace.", href: "/workspaces/tissue-atlas", category: "KNOWLEDGE", icon: "✺" },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> COMPUTATIONAL CYTOLOGY & HISTOPATHOLOGY</div>
          <h1>Understand tissue.<br /><span>Discover patterns.</span></h1>
          <p>
            An integrated research environment for digital microscopy,
            computational tissue analysis and experimental artificial intelligence.
          </p>
          <div className="hero-actions">
            <Link href="/workspaces/digital-microscopy" className="primary-button">Open microscopy workspace ↗</Link>
            <Link href="/workspaces/dataset-laboratory" className="secondary-button">Explore datasets</Link>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="visual-core">C<span>✳</span></div>
          <div className="visual-label label-one">IMAGE ANALYSIS</div>
          <div className="visual-label label-two">COMPUTATIONAL BIOLOGY</div>
          <div className="visual-label label-three">AI RESEARCH</div>
        </div>
      </section>

      <section className="metrics-grid">
        <div className="metric-card"><span className="metric-label">RESEARCH WORKSPACES</span><strong>15</strong><span className="metric-note">Integrated modules planned</span></div>
        <div className="metric-card"><span className="metric-label">CANCER CATEGORIES</span><strong>10</strong><span className="metric-note">Research scope defined</span></div>
        <div className="metric-card"><span className="metric-label">PLATFORM STATUS</span><strong className="metric-status">FOUNDATION</strong><span className="metric-note">Initial development stage</span></div>
        <div className="metric-card"><span className="metric-label">DEPLOYMENT</span><strong className="metric-status">LOCAL</strong><span className="metric-note">Running on your machine</span></div>
      </section>

      <section className="section-heading">
        <div><div className="eyebrow">THE RESEARCH ENVIRONMENT</div><h2>Explore workspaces</h2><p>Fifteen connected areas for computational pathology research.</p></div>
        <span className="section-count">01 — 15 MODULES</span>
      </section>

      <section className="workspace-grid">
        {modules.map((item) => (
          <Link href={item.href} className="workspace-card" key={item.n}>
            <div className="workspace-card-top"><span className="workspace-icon">{item.icon}</span><span className="workspace-number">{item.n}</span></div>
            <div className="workspace-category">{item.category}</div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
            <div className="workspace-open">Open workspace <span>↗</span></div>
          </Link>
        ))}
      </section>

      <section className="disclaimer">
        <div className="disclaimer-icon">i</div>
        <div><strong>Research and educational use only</strong><p>CYTOGENIX is an experimental biomedical research and educational platform. Its outputs are not intended for clinical diagnosis, screening, treatment decisions or patient management. No clinical performance or validation is claimed.</p></div>
      </section>
    </>
  );
}
