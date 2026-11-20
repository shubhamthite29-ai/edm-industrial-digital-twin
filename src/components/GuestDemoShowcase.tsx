import React from "react";
import {
  Award,
  CheckCircle2,
  FileText,
  Lock,
  Sparkles,
} from "lucide-react";
import {
  PUBLISHED_DEMO_SAMPLES,
  PUBLISHED_PROJECT_METADATA,
} from "../data/guest/publishedDemoData";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";

export const GuestDemoShowcase: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-plant-cyan/40 bg-plant-cyan/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-plant-cyan text-plant-void font-bold">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-plant-text">
                Public Demonstration & Research Showcase
              </h3>
              <StatusPill label="Guest Demo" tone="cyan" />
            </div>
            <p className="text-xs text-plant-muted">
              Displaying published benchmark results for Titanium Ti-6Al-4V on ELEKTRA PULS S-50 ZNC.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-plant-muted">
          <Lock size={14} className="text-plant-amber" />
          <span>Physical machine writeback & raw datasets restricted to authorized personnel</span>
        </div>
      </div>

      {/* Project Overview Card */}
      <Panel
        title="Project Overview & Academic Methodology"
        eyebrow="Rajarambapu Institute of Technology / Mechatronics Engineering"
        accent="cyan"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-plant-cyan flex items-center gap-1.5">
              <Award size={14} />
              Key Capstone Achievements
            </h4>
            <ul className="space-y-2 text-xs text-plant-muted">
              {PUBLISHED_PROJECT_METADATA.achievements.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-plant-green" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-plant-cyan flex items-center gap-1.5">
              <FileText size={14} />
              Research Methodology
            </h4>
            <ul className="space-y-2 text-xs text-plant-muted">
              {PUBLISHED_PROJECT_METADATA.methodology.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-plant-cyan" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      {/* Published Benchmark Table */}
      <Panel
        title="Published Physical Experimental Benchmarks"
        eyebrow="Authentic Ti-6Al-4V Validation Cuts (Model vs Laboratory Metrology)"
        accent="green"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-plant-line text-[10px] uppercase text-plant-muted">
                <th className="py-2.5 px-3">Condition</th>
                <th className="py-2.5 px-2">Ip (A)</th>
                <th className="py-2.5 px-2">Vg (V)</th>
                <th className="py-2.5 px-2">Ton (µs)</th>
                <th className="py-2.5 px-2">Toff (µs)</th>
                <th className="py-2.5 px-2">Actual MRR (g/min)</th>
                <th className="py-2.5 px-2">Pred MRR (g/min)</th>
                <th className="py-2.5 px-2">MRR Error</th>
                <th className="py-2.5 px-2">Actual TWR (g/min)</th>
                <th className="py-2.5 px-2">Pred TWR (g/min)</th>
                <th className="py-2.5 px-2">TWR Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-plant-line/60">
              {PUBLISHED_DEMO_SAMPLES.map((sample) => (
                <tr key={sample.sampleId} className="hover:bg-plant-deck/50 transition-colors">
                  <td className="py-2 px-3 font-semibold text-plant-text">
                    <div>{sample.conditionName}</div>
                    <div className="text-[10px] text-plant-muted font-normal">{sample.sampleId}</div>
                  </td>
                  <td className="py-2 px-2 text-plant-cyan">{sample.Ip}</td>
                  <td className="py-2 px-2 text-plant-cyan">{sample.Vg}</td>
                  <td className="py-2 px-2 text-plant-cyan">{sample.Ton}</td>
                  <td className="py-2 px-2 text-plant-cyan">{sample.Toff}</td>
                  <td className="py-2 px-2 text-plant-text">{sample.publishedMrr.toFixed(4)}</td>
                  <td className="py-2 px-2 text-plant-green">{sample.predictedMrr.toFixed(4)}</td>
                  <td className="py-2 px-2 text-plant-green font-bold">{sample.errorMrrPct.toFixed(2)}%</td>
                  <td className="py-2 px-2 text-plant-text">{sample.publishedTwr.toFixed(4)}</td>
                  <td className="py-2 px-2 text-plant-amber">{sample.predictedTwr.toFixed(4)}</td>
                  <td className="py-2 px-2 text-plant-amber font-bold">{sample.errorTwrPct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};
