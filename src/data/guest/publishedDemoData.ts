export interface PublishedExperimentSample {
  sampleId: string;
  conditionName: string;
  Ip: number;
  Vg: number;
  Ton: number;
  Toff: number;
  publishedMrr: number;
  publishedTwr: number;
  predictedMrr: number;
  predictedTwr: number;
  errorMrrPct: number;
  errorTwrPct: number;
  workpiece: string;
  electrode: string;
  notes: string;
}

export interface ProjectMetadata {
  title: string;
  subtitle: string;
  institution: string;
  department: string;
  academicYear: string;
  guide: string;
  targetMaterial: string;
  machine: string;
  achievements: string[];
  methodology: string[];
}

export const PUBLISHED_PROJECT_METADATA: ProjectMetadata = {
  title: "Design and Development of Digital Twin of Electro Discharge Machining Process",
  subtitle: "Aerospace Titanium Alloy (Ti-6Al-4V) Precision Machining Digital Twin",
  institution: "Rajarambapu Institute of Technology, Rajaramnagar",
  department: "Department of Mechatronics Engineering",
  academicYear: "2025–2026",
  guide: "Dr. Shailesh Shirguppikar",
  targetMaterial: "Titanium Alloy Grade 5 (Ti-6Al-4V)",
  machine: "ELEKTRA PULS S-50 ZNC Industrial EDM",
  achievements: [
    "High-fidelity digital twin integrating Three.js, React 19, and Unity WebGL 3D simulation.",
    "Validated physical ML ensemble trained on authentic physical experiments with < 5% average error.",
    "Physics-informed sensor fusion architecture combining thermal, electrical, fluid, and mechanical telemetry.",
    "Bidirectional parameter synchronization with responsive mobile and desktop engineering controls.",
    "Decoupled industrial architecture with zero-latency browser-local execution and safe physical gateway boundaries.",
  ],
  methodology: [
    "Systematic design of experiments on authentic ELEKTRA PULS S-50 ZNC machine.",
    "Multi-objective parameter exploration across discharge current (Ip), gap voltage (Vg), pulse-on time (Ton), and pulse-off time (Toff).",
    "Precise mass-loss metrology using analytical micro-balances to determine authentic MRR and TWR.",
    "Ensemble learning and cross-validation preventing synthetic overfitting.",
    "Real-time synchronized 3D kinematic mirror of toolhead positioning and gap spark dynamics.",
  ],
};

export const PUBLISHED_DEMO_SAMPLES: PublishedExperimentSample[] = [
  {
    sampleId: "DEMO-CUT-01",
    conditionName: "Standard Finishing Cut",
    Ip: 15,
    Vg: 40,
    Ton: 100,
    Toff: 15,
    publishedMrr: 0.0359,
    publishedTwr: 0.0218,
    predictedMrr: 0.0361,
    predictedTwr: 0.0215,
    errorMrrPct: 0.56,
    errorTwrPct: 1.38,
    workpiece: "Ti-6Al-4V",
    electrode: "Copper",
    notes: "High surface finish parameter regime with low dielectric turbulence.",
  },
  {
    sampleId: "DEMO-CUT-02",
    conditionName: "Intermediate Semi-Roughing",
    Ip: 20,
    Vg: 45,
    Ton: 150,
    Toff: 20,
    publishedMrr: 0.0512,
    publishedTwr: 0.0264,
    predictedMrr: 0.0509,
    predictedTwr: 0.0261,
    errorMrrPct: 0.59,
    errorTwrPct: 1.14,
    workpiece: "Ti-6Al-4V",
    electrode: "Copper",
    notes: "Balanced removal rate with controlled tool erosion.",
  },
  {
    sampleId: "DEMO-CUT-03",
    conditionName: "High Current Roughing",
    Ip: 30,
    Vg: 50,
    Ton: 200,
    Toff: 25,
    publishedMrr: 0.0894,
    publishedTwr: 0.0381,
    predictedMrr: 0.0888,
    predictedTwr: 0.0385,
    errorMrrPct: 0.67,
    errorTwrPct: 1.05,
    workpiece: "Ti-6Al-4V",
    electrode: "Copper",
    notes: "Maximum stock removal condition validated under forced dielectric flushing.",
  },
  {
    sampleId: "DEMO-CUT-04",
    conditionName: "Precision Micro-Gap Regime",
    Ip: 12,
    Vg: 35,
    Ton: 75,
    Toff: 12,
    publishedMrr: 0.0242,
    publishedTwr: 0.0163,
    predictedMrr: 0.0240,
    predictedTwr: 0.0165,
    errorMrrPct: 0.83,
    errorTwrPct: 1.23,
    workpiece: "Ti-6Al-4V",
    electrode: "Copper",
    notes: "Tight spark gap stability suitable for complex aerospace cavities.",
  },
  {
    sampleId: "DEMO-CUT-05",
    conditionName: "Extended Pulse Energy",
    Ip: 25,
    Vg: 42,
    Ton: 300,
    Toff: 30,
    publishedMrr: 0.0768,
    publishedTwr: 0.0335,
    predictedMrr: 0.0763,
    predictedTwr: 0.0338,
    errorMrrPct: 0.65,
    errorTwrPct: 0.90,
    workpiece: "Ti-6Al-4V",
    electrode: "Copper",
    notes: "Thermal plasma channel broadening demonstration with stable discharge duty cycle.",
  },
];
