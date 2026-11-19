import Link from "next/link";

const modules = [
  {
    n: "00",
    title: "Integrated Cancer Analysis",
    desc: "Move through image processing, tissue segmentation, cellular measurements and spatial analysis in one connected workflow.",
    href: "/workspaces/research-analysis",
    category: "CANCER IMAGE ANALYSIS",
    icon: "⌘",
  },
  {
    n: "01",
    title: "Digital Microscopy",
    desc: "Import, organise and examine digital tissue and cell images.",
    href: "/workspaces/digital-microscopy",
    category: "DIGITAL PATHOLOGY",
    icon: "◉",
  },
  {
    n: "02",
    title: "Image Quality & Processing",
    desc: "Evaluate image quality and prepare microscopy images for computational analysis.",
    href: "/workspaces/image-quality-processing",
    category: "IMAGE PROCESSING",
    icon: "▧",
  },
  {
    n: "03",
    title: "Tissue Segmentation",
    desc: "Explore tissue regions and visual structures using image segmentation.",
    href: "/workspaces/tissue-segmentation",
    category: "TISSUE ANALYSIS",
    icon: "⬡",
  },
  {
    n: "04",
    title: "Cellular Intelligence",
    desc: "Examine cellular structures and quantitative features in microscopy images.",
    href: "/workspaces/cellular-intelligence",
    category: "CELLULAR ANALYSIS",
    icon: "◎",
  },
  {
    n: "05",
    title: "Nuclear Morphometry",
    desc: "Measure nuclear shape, size and morphology from image data.",
    href: "/workspaces/nuclear-morphometry",
    category: "NUCLEAR ANALYSIS",
    icon: "◌",
  },
  {
    n: "06",
    title: "Tumour Microenvironment",
    desc: "Explore tissue context and cellular neighbourhoods in tumour-related images.",
    href: "/workspaces/tumour-microenvironment",
    category: "TUMOUR BIOLOGY",
    icon: "✳",
  },
  {
    n: "07",
    title: "Spatial Analysis",
    desc: "Investigate spatial organisation and cellular distribution within tissue images.",
    href: "/workspaces/spatial-analysis",
    category: "SPATIAL ANALYSIS",
    icon: "⌖",
  },
  {
    n: "08",
    title: "Cancer Reference Slide Library",
    desc: "Browse and organise reference histopathology images by cancer category.",
    href: "/workspaces/reference-slide-library",
    category: "CANCER REFERENCES",
    icon: "▤",
  },
  {
    n: "09",
    title: "Reports & Publications",
    desc: "Organise image analysis results and prepare structured scientific reports.",
    href: "/workspaces/reports",
    category: "ANALYSIS OUTPUT",
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
            CANCER CELLULAR & TISSUE INTELLIGENCE
          </div>

          <h1>
            Understand cancer.
            <br />
            <span>Through cellular intelligence.</span>
          </h1>

          <p>
            CYTOGENIX brings digital microscopy, tissue analysis,
            cellular measurements and cancer-related image exploration
            together in one computational platform.
          </p>

          <div className="hero-actions">
            <Link href="/workspaces/research-analysis" className="primary-button">
              Start Cancer Analysis <span>↗</span>
            </Link>
            <Link href="/workspaces/reference-slide-library" className="secondary-button">
              Explore Cancer References
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
          <div className="hero-art-tag hero-art-tag-one">CANCER CELLS</div>
          <div className="hero-art-tag hero-art-tag-two">CELLULAR ANALYSIS</div>
          <div className="hero-art-tag hero-art-tag-three">DIGITAL PATHOLOGY</div>
        </div>
      </section>

      <section className="home-intro">
        <div>
          <div className="eyebrow">THE CYTOGENIX PLATFORM</div>
          <h2>From microscope images to cellular insights</h2>
          <p>
            Follow a connected pathway for importing tissue images,
            processing visual data, examining cellular structures,
            exploring cancer references and documenting results.
          </p>
        </div>

        <div className="home-workflow">
          <div className="workflow-step">
            <span>01</span>
            <strong>Capture</strong>
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
            <small>Cells and tissues</small>
          </div>
          <div className="workflow-connector" />
          <div className="workflow-step">
            <span>04</span>
            <strong>Explore</strong>
            <small>Cancer references</small>
          </div>
        </div>
      </section>

      <section className="home-section-heading">
        <div>
          <div className="eyebrow">CYTOGENIX MODULES</div>
          <h2>Cancer analysis workspaces</h2>
          <p>
            Connected tools for digital pathology, cellular measurements
            and tumour-related image exploration.
          </p>
        </div>
        <span className="home-section-mark">CYTOGENIX / CANCER INTELLIGENCE</span>
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
          <div className="eyebrow">CANCER REFERENCE COLLECTION</div>
          <h2>Explore a structured cancer slide library</h2>
          <p>
            Organise histopathology reference slides by cancer category,
            record available source and staining information, and open
            selected images in Digital Microscopy.
          </p>
          <Link href="/workspaces/reference-slide-library">
            Open Cancer Reference Slide Library <span>↗</span>
          </Link>
        </div>
      </section>

      <section className="disclaimer">
        <div className="disclaimer-icon">i</div>
        <div>
          <strong>Scientific and educational use</strong>
          <p>
            CYTOGENIX provides computational image measurements and
            cancer-related image exploration. Its outputs are not validated
            for clinical diagnosis, cancer screening or treatment decisions.
            Reference image comparisons do not establish a patient's diagnosis.
          </p>
        </div>
      </section>
    </div>
  );
}
