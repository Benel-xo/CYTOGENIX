import Link from "next/link";

const workspaces = [
  ["01", "Research Overview", "/"],
  ["02", "Digital Microscopy", "/workspaces/digital-microscopy"],
  ["03", "Image Quality & Processing", "/workspaces/image-processing"],
  ["04", "Cancer AI Classification", "/workspaces/cancer-classification"],
  ["05", "Tissue Segmentation", "/workspaces/tissue-segmentation"],
  ["06", "Cellular Intelligence", "/workspaces/cellular-intelligence"],
  ["07", "Nuclear Morphometry", "/workspaces/nuclear-morphometry"],
  ["08", "Tumour Microenvironment", "/workspaces/tumour-microenvironment"],
  ["09", "Spatial Analysis", "/workspaces/spatial-analysis"],
  ["10", "Explainable AI", "/workspaces/explainable-ai"],
  ["11", "Training & Model Lab", "/workspaces/model-laboratory"],
  ["12", "Evaluation & Reliability", "/workspaces/evaluation"],
  ["13", "Dataset Laboratory", "/workspaces/dataset-laboratory"],
  ["14", "Reports & Publications", "/workspaces/reports"],
  ["15", "Tissue Atlas & AI Assistant", "/workspaces/tissue-atlas"],
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">CYTOGENIX</div>
            <div className="brand-caption">RESEARCH INTELLIGENCE</div>
          </div>
        </Link>

        <div className="nav-heading">RESEARCH ENVIRONMENT</div>
        <nav className="navigation">
          {workspaces.map(([number, name, href]) => (
            <Link className="nav-link" href={href} key={number}>
              <span className="nav-number">{number}</span>
              <span>{name}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="system-indicator">
            <span className="status-dot" />
            Local environment
          </div>
          <div className="sidebar-version">CYTOGENIX v0.1.0 · DEVELOPMENT</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="topbar-label">COMPUTATIONAL PATHOLOGY PLATFORM</div>
            <div className="topbar-title">Research Workstation</div>
          </div>
          <div className="topbar-right">
            <span className="environment-tag">LOCAL DEVELOPMENT</span>
            <span className="avatar">R</span>
          </div>
        </header>
        <div className="page-content">{children}</div>
        <footer className="footer">
          CYTOGENIX · Experimental Biomedical Research Platform
          <span>Not for clinical diagnosis or patient management</span>
        </footer>
      </main>
    </div>
  );
}
