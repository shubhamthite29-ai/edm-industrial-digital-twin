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
  introduction: string;
  achievements: string[];
  methodology: string[];
}

export const PUBLISHED_PROJECT_METADATA: ProjectMetadata = {
  title: "EDM Industrial Digital Twin",
  subtitle: "Digital Representation of Electro Discharge Machining for Aerospace Materials",
  institution: "Rajarambapu Institute of Technology, Rajaramnagar",
  department: "Department of Mechatronics Engineering",
  academicYear: "2025–2026",
  guide: "Dr. Shailesh Shirguppikar",
  targetMaterial: "Titanium Alloy Grade 5 (Ti-6Al-4V)",
  machine: "ELEKTRA PULS S-50 ZNC Industrial EDM",
  introduction:
    "Welcome to the EDM Digital Twin. This project presents a digital representation of an Electrical Discharge Machining (EDM) system. It brings together machine visualization, process parameters, experimental results and machine learning-based predictions in one interface. Explore the machine, understand the machining process, view the toolhead simulation and see how different machining parameters affect performance.",
  achievements: [
    "Interactive 3D digital representation of the ELEKTRA PULS S-50 ZNC machine.",
    "Toolhead Digital Twin simulation demonstrating electrode motion and positioning.",
    "Validated machine learning model predicting Material Removal Rate (MRR) and Tool Wear Rate (TWR).",
    "Comprehensive experimental evaluation on aerospace Titanium Alloy (Ti-6Al-4V).",
    "Clean, responsive interface for process parameter monitoring and analysis.",
  ],
  methodology: [
    "Conduct controlled physical machining experiments on the ELEKTRA PULS S-50 ZNC EDM.",
    "Systematically vary pulse-on time (Ton), pulse-off time (Toff), current (Ip), and voltage (Vg).",
    "Measure workpiece and electrode weight changes using high-precision laboratory balances.",
    "Train and validate predictive regression models to forecast machining outcomes.",
    "Connect the experimental findings with 3D kinematic visualizations in an interactive dashboard.",
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
