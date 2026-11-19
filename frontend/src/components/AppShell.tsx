import Link from "next/link";

const workspaces = [
  ["00", "Cancer Analysis Dashboard", "/workspaces/research-dashboard"],
  ["01", "Cancer Intelligence Overview", "/"],
  ["02", "Integrated Cancer Analysis", "/workspaces/research-analysis"],
  ["03", "Digital Microscopy", "/workspaces/digital-microscopy"],
  ["04", "Image Quality & Processing", "/workspaces/image-quality-processing"],
  ["05", "Tissue Segmentation", "/workspaces/tissue-segmentation"],
  ["06", "Cellular Intelligence", "/workspaces/cellular-intelligence"],
  ["07", "Nuclear Morphometry", "/workspaces/nuclear-morphometry"],
  ["08", "Tumour Microenvironment", "/workspaces/tumour-microenvironment"],
  ["09", "Spatial Analysis", "/workspaces/spatial-analysis"],
  ["10", "Reports & Publications", "/workspaces/reports"],
  ["11", "Cancer Reference Slide Library", "/workspaces/reference-slide-library"],
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">CYTOGENIX</div>
            <div className="brand-caption">CANCER INTELLIGENCE</div>
          </div>
        </Link>

        <div className="nav-heading">CANCER ANALYSIS</div>
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
            Platform available
          </div>
          <div className="sidebar-version">CYTOGENIX · CANCER INTELLIGENCE</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="topbar-label">CANCER CELLULAR & TISSUE INTELLIGENCE</div>
            <div className="topbar-title">Cancer Analysis Platform</div>
          </div>
          <div className="topbar-right">
            <span className="environment-tag">CYTOGENIX</span>
            <span className="avatar">C</span>
          </div>
        </header>

        <div className="page-content">{children}</div>

        <footer className="footer">
          <span>CYTOGENIX · Cancer Cellular & Tissue Intelligence</span>
          <span>Scientific and educational use · Not for clinical diagnosis</span>
        </footer>
      </main>
    </div>
  );
}
