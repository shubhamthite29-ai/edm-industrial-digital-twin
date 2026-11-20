import React from "react";
import {
  Boxes,
  Flame,
  Info,
  Layers,
  Sliders,
} from "lucide-react";
import { Panel } from "./Panel";

export const EdmMachineInfoPanel: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <Panel
      title="About the EDM Machine"
      eyebrow="Process & Component Guide"
      accent="cyan"
      className={`flex flex-col text-xs leading-relaxed text-plant-text ${className}`}
    >
      <div className="space-y-4 overflow-y-auto max-h-[580px] pr-1 font-sans">
        {/* Intro */}
        <div className="rounded-lg border border-plant-cyan/30 bg-plant-cyan/5 p-3">
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-plant-cyan text-[11px]">
            <Info size={14} className="shrink-0" />
            <span>Process Overview</span>
          </div>
          <p className="mt-1.5 text-[11px] text-plant-muted leading-relaxed">
            Electrical Discharge Machining (EDM) is a non-traditional thermal machining process that removes material
            using controlled high-frequency electrical discharges between an electrode tool and a conductive workpiece
            immersed in a dielectric fluid.
          </p>
        </div>

        {/* 1. Main Components */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-plant-text text-[11px]">
            <Layers size={13} className="text-plant-cyan shrink-0" />
            <span>1. Main Components</span>
          </div>
          <div className="grid gap-1.5 text-[11px]">
            <div className="rounded border border-plant-line bg-plant-void/60 p-2">
              <span className="font-semibold text-white">Electrode (Tool):</span>{" "}
              <span className="text-plant-muted">High-conductivity tool (e.g. Copper) shaped to impart the required geometry.</span>
            </div>
            <div className="rounded border border-plant-line bg-plant-void/60 p-2">
              <span className="font-semibold text-white">Workpiece:</span>{" "}
              <span className="text-plant-muted">Conductive aerospace metal (e.g. Titanium Ti-6Al-4V) clamped in the tank fixture.</span>
            </div>
            <div className="rounded border border-plant-line bg-plant-void/60 p-2">
              <span className="font-semibold text-white">Dielectric Fluid & Tank:</span>{" "}
              <span className="text-plant-muted">Hydrocarbon dielectric oil that insulates, cools the gap, and flushes away eroded debris.</span>
            </div>
            <div className="rounded border border-plant-line bg-plant-void/60 p-2">
              <span className="font-semibold text-white">Power Supply (Pulse Generator):</span>{" "}
              <span className="text-plant-muted">Delivers precise DC voltage pulses with adjustable current, frequency, and duty cycle.</span>
            </div>
            <div className="rounded border border-plant-line bg-plant-void/60 p-2">
              <span className="font-semibold text-white">Toolhead & Feed Mechanism:</span>{" "}
              <span className="text-plant-muted">Precision Z-axis servo drive maintaining the microscopic spark gap without physical contact.</span>
            </div>
          </div>
        </div>

        {/* 2. How It Works */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-plant-text text-[11px]">
            <Flame size={13} className="text-plant-amber shrink-0" />
            <span>2. How It Works</span>
          </div>
          <div className="rounded border border-plant-line bg-plant-void/60 p-2.5 text-[11px] text-plant-muted space-y-1.5">
            <p>
              When voltage builds across the electrode and workpiece, the dielectric fluid ionizes at the closest point,
              creating a localized plasma channel and electrical spark.
            </p>
            <p>
              Intense thermal energy melts and vaporizes microscopic volumes of material from both the workpiece and tool.
            </p>
            <p>
              When the spark turns off, the surrounding dielectric flushes the solidified metal debris (swarf) out of the gap,
              preparing the channel for the next spark cycle.
            </p>
          </div>
        </div>

        {/* 3. Important Parameters */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-plant-text text-[11px]">
            <Sliders size={13} className="text-plant-green shrink-0" />
            <span>3. Important Parameters</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 text-[11px]">
            <div className="flex items-baseline justify-between rounded border border-plant-line bg-plant-void/60 px-2 py-1.5">
              <span className="font-semibold text-plant-cyan">Pulse-On Time (Ton):</span>
              <span className="text-plant-muted font-mono text-[10px]">Duration of spark discharge (µs)</span>
            </div>
            <div className="flex items-baseline justify-between rounded border border-plant-line bg-plant-void/60 px-2 py-1.5">
              <span className="font-semibold text-plant-cyan">Pulse-Off Time (Toff):</span>
              <span className="text-plant-muted font-mono text-[10px]">Deionization & flushing interval (µs)</span>
            </div>
            <div className="flex items-baseline justify-between rounded border border-plant-line bg-plant-void/60 px-2 py-1.5">
              <span className="font-semibold text-plant-amber">Peak Current (Ip):</span>
              <span className="text-plant-muted font-mono text-[10px]">Spark energy amplitude (A)</span>
            </div>
            <div className="flex items-baseline justify-between rounded border border-plant-line bg-plant-void/60 px-2 py-1.5">
              <span className="font-semibold text-plant-amber">Gap Voltage (Vg):</span>
              <span className="text-plant-muted font-mono text-[10px]">Potential across dielectric (V)</span>
            </div>
            <div className="flex items-baseline justify-between rounded border border-plant-line bg-plant-void/60 px-2 py-1.5">
              <span className="font-semibold text-plant-green">Spark Gap:</span>
              <span className="text-plant-muted font-mono text-[10px]">Working clearance (~10–50 µm)</span>
            </div>
          </div>
        </div>

        {/* 4. What the Simulation Shows */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-plant-text text-[11px]">
            <Boxes size={13} className="text-plant-violet shrink-0" />
            <span>4. What the Simulation Shows</span>
          </div>
          <div className="rounded border border-plant-line bg-plant-void/60 p-2.5 text-[11px] text-plant-muted">
            The 3D model represents the ELEKTRA PULS S-50 ZNC machine. It allows visitors to observe the toolhead assembly,
            electrode movement, workpiece placement in the dielectric tank, and real-time spark physics simulation
            synchronized with operational parameters.
          </div>
        </div>
      </div>
    </Panel>
  );
};
