import Link from "next/link";

const workspaces = [
  ["01", "Research Overview", "/"],
  ["02", "Integrated Research Analysis", "/workspaces/research-analysis"],
  ["03", "Digital Microscopy", "/workspaces/digital-microscopy"],
  ["04", "Image Quality & Processing", "/workspaces/image-quality-processing"],
  ["05", "Tissue Segmentation", "/workspaces/tissue-segmentation"],
  ["06", "Cellular Intelligence", "/workspaces/cellular-intelligence"],
  ["07", "Nuclear Morphometry", "/workspaces/nuclear-morphometry"],
  ["08", "Tumour Microenvironment", "/workspaces/tumour-microenvironment"],
  ["09", "Spatial Analysis", "/workspaces/spatial-analysis"],
  ["10", "Reports & Publications", "/workspaces/reports"],
  ["11", "Reference Slide Library", "/workspaces/reference-slide-library"],
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">CYTOGENIX</div>
            <div className="brand-caption">COMPUTATIONAL PATHOLOGY</div>
          </div>
        </Link>

        <div className="nav-heading">RESEARCH WORKSPACES</div>
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
            Research environment
          </div>
          <div className="sidebar-version">CYTOGENIX · RESEARCH PLATFORM</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="topbar-label">COMPUTATIONAL CYTOLOGY & HISTOPATHOLOGY</div>
            <div className="topbar-title">Research Workstation</div>
          </div>
          <div className="topbar-right">
            <span className="environment-tag">RESEARCH EDITION</span>
            <span className="avatar">C</span>
          </div>
        </header>

        <div className="page-content">{children}</div>

        <footer className="footer">
          <span>CYTOGENIX · Computational Cytology & Histopathology</span>
          <span>Research and educational use only · Not for clinical diagnosis</span>
        </footer>
      </main>
    </div>
  );
}
