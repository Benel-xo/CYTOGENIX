import Link from "next/link";

const modules = [
  {
    n: "00",
    title: "Integrated Cancer Analysis",
    desc: "Run a connected microscopy research workflow from image quality through segmentation, cellular measurements and spatial analysis.",
    href: "/workspaces/research-analysis",
    category: "COMPLETE RESEARCH WORKFLOW",
    icon: "⌘",
  },
  {
    n: "01",
    title: "Digital Microscopy",
    desc: "Import, organise and inspect digital microscopy images in one workspace.",
    href: "/workspaces/digital-microscopy",
    category: "IMAGE MANAGEMENT",
    icon: "◉",
  },
  {
    n: "02",
    title: "Image Quality & Processing",
    desc: "Review image characteristics and prepare microscopy images for analysis.",
    href: "/workspaces/image-quality-processing",
    category: "IMAGE PROCESSING",
    icon: "▧",
  },
  {
    n: "03",
    title: "Tissue Segmentation",
    desc: "Explore tissue regions through image-based segmentation methods.",
    href: "/workspaces/tissue-segmentation",
    category: "TISSUE ANALYSIS",
    icon: "⬡",
  },
  {
    n: "04",
    title: "Cellular Intelligence",
    desc: "Examine cellular structures and quantitative image features.",
    href: "/workspaces/cellular-intelligence",
    category: "CELLULAR ANALYSIS",
    icon: "◎",
  },
  {
    n: "05",
    title: "Nuclear Morphometry",
    desc: "Explore quantitative measurements of nuclear morphology.",
    href: "/workspaces/nuclear-morphometry",
    category: "QUANTITATIVE ANALYSIS",
    icon: "◌",
  },
  {
    n: "06",
    title: "Tumour Microenvironment",
    desc: "Study tissue context and cellular neighbourhoods in histopathology images.",
    href: "/workspaces/tumour-microenvironment",
    category: "TISSUE CONTEXT",
    icon: "✳",
  },
  {
    n: "07",
    title: "Spatial Analysis",
    desc: "Investigate spatial organisation and patterns within tissue images.",
    href: "/workspaces/spatial-analysis",
    category: "SPATIAL BIOLOGY",
    icon: "⌖",
  },
  {
    n: "08",
    title: "Reference Slide Library",
    desc: "Browse and manage reference images organised by cancer category.",
    href: "/workspaces/reference-slide-library",
    category: "REFERENCE COLLECTION",
    icon: "▤",
  },
  {
    n: "09",
    title: "Reports & Publications",
    desc: "Organise research findings and prepare structured research outputs.",
    href: "/workspaces/reports",
    category: "RESEARCH OUTPUT",
    icon: "▧",
  },
];

export default function Home() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="eyebrow">
            <span className="status-dot" />
            COMPUTATIONAL CYTOLOGY & HISTOPATHOLOGY
          </div>

          <h1>
            Explore tissue.
            <br />
            <span>Understand patterns.</span>
          </h1>

          <p>
            CYTOGENIX brings digital microscopy, image processing and
            computational tissue analysis together in an integrated biomedical
            research environment.
          </p>

          <div className="hero-actions">
            <Link
              href="/workspaces/research-analysis"
              className="primary-button"
            >
              Open Integrated Analysis <span>↗</span>
            </Link>
            <Link
              href="/workspaces/reference-slide-library"
              className="secondary-button"
            >
              Browse Reference Library
            </Link>
          </div>
        </div>

        <div className="home-hero-art" aria-hidden="true">
          <div className="hero-ring hero-ring-one" />
          <div className="hero-ring hero-ring-two" />
          <div className="hero-ring hero-ring-three" />
          <div className="hero-art-core">
            <span>C</span>
            <small>CYTOGENIX</small>
          </div>
          <div className="hero-art-tag hero-art-tag-one">MICROSCOPY</div>
          <div className="hero-art-tag hero-art-tag-two">IMAGE ANALYSIS</div>
          <div className="hero-art-tag hero-art-tag-three">TISSUE SCIENCE</div>
        </div>
      </section>

      <section className="home-intro">
        <div>
          <div className="eyebrow">THE PLATFORM</div>
          <h2>A connected environment for tissue research</h2>
          <p>
            Move from image import to computational analysis, reference
            exploration and research documentation through dedicated
            workspaces.
          </p>
        </div>

        <div className="home-workflow">
          <div className="workflow-step">
            <span>01</span>
            <strong>Import</strong>
            <small>Microscopy images</small>
          </div>
          <div className="workflow-connector" />
          <div className="workflow-step">
            <span>02</span>
            <strong>Process</strong>
            <small>Image preparation</small>
          </div>
          <div className="workflow-connector" />
          <div className="workflow-step">
            <span>03</span>
            <strong>Analyse</strong>
            <small>Tissue and cells</small>
          </div>
          <div className="workflow-connector" />
          <div className="workflow-step">
            <span>04</span>
            <strong>Document</strong>
            <small>Research findings</small>
          </div>
        </div>
      </section>

      <section className="home-section-heading">
        <div>
          <div className="eyebrow">EXPLORE CYTOGENIX</div>
          <h2>Cancer analysis workspaces</h2>
          <p>
            Dedicated tools for digital pathology and computational tissue
            exploration.
          </p>
        </div>
        <span className="home-section-mark">CYTOGENIX / WORKSPACES</span>
      </section>

      <section className="workspace-grid">
        {modules.map((item) => (
          <Link href={item.href} className="workspace-card" key={item.n}>
            <div className="workspace-card-top">
              <span className="workspace-icon">{item.icon}</span>
              <span className="workspace-number">{item.n}</span>
            </div>
            <div className="workspace-category">{item.category}</div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
            <div className="workspace-open">
              Open workspace <span>↗</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="home-feature">
        <div className="home-feature-symbol">✳</div>
        <div>
          <div className="eyebrow">REFERENCE COLLECTION</div>
          <h2>Build a structured histopathology library</h2>
          <p>
            Organise reference slides by cancer category, record source and
            staining information, and open selected images in Digital
            Microscopy.
          </p>
          <Link href="/workspaces/reference-slide-library">
            Explore the Reference Slide Library <span>↗</span>
          </Link>
        </div>
      </section>

      <section className="disclaimer">
        <div className="disclaimer-icon">i</div>
        <div>
          <strong>Research and educational use only</strong>
          <p>
            CYTOGENIX is an experimental biomedical research and educational
            platform. Its image measurements and computational outputs are not
            intended for clinical diagnosis, screening, treatment decisions or
            patient management. No clinical performance or validation is
            claimed.
          </p>
        </div>
      </section>
    </div>
  );
}
