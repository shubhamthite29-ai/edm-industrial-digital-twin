import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  Sliders,
  Database,
  FileSpreadsheet,
  Download,
  Save,
  Trash2,
  ArrowUpDown,
  Filter,
} from "lucide-react";
import { StatusPill } from "./StatusPill";
import { IntegerParameterInput } from "./IntegerParameterInput";
import {
  predictPhysicalMl,
  evaluateActualVsPredicted,
  getPhysicalMlModelInfo,
  getPhysicalMlInputRanges,
  getPhysicalHistoricalExperiments,
  getPhysicalHistoricalSummary,
  loadFutureExperiments,
  saveFutureExperiment,
  updateFutureExperimentActuals,
  deleteFutureExperiment,
  exportFutureExperimentsCsv,
  exportFutureExperimentsJson,
  type PhysicalMlPredictionResult,
  type HistoricalPhysicalExperiment,
  type FutureExperimentRecord,
} from "../services/physicalMlService";

interface PhysicalMachineMlPanelProps {
  onApplyToMachine?: (params: { current: number; voltage: number; pulseOn: number; pulseOff: number }) => void;
}

function safeFmt(value: number | null | undefined, digits = 4, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : fallback;
}

type SortField =
  | "sr_no"
  | "Ip"
  | "Vg"
  | "Ton"
  | "Toff"
  | "actual_mrr"
  | "pred_mrr"
  | "mrr_err_pct"
  | "actual_twr"
  | "pred_twr"
  | "twr_err_pct";

type FilterCategory = "all" | "mrr_gt_5" | "twr_gt_5" | "major" | "both_le_5";

export const PhysicalMachineMlPanel: React.FC<PhysicalMachineMlPanelProps> = ({ onApplyToMachine }) => {
  const modelInfo = getPhysicalMlModelInfo();
  const inputRanges = getPhysicalMlInputRanges();
  const historicalExperiments = getPhysicalHistoricalExperiments();
  const historicalSummary = getPhysicalHistoricalSummary();

  // 1. Four Core Integer Input Fields (Ip, Vg, TON, TOFF)
  const [ipVal, setIpVal] = useState<number>(30);
  const [vgVal, setVgVal] = useState<number>(50);
  const [tonVal, setTonVal] = useState<number>(400);
  const [toffVal, setToffVal] = useState<number>(6);

  // 2. Prediction State
  const [prediction, setPrediction] = useState<PhysicalMlPredictionResult | null>(null);
  const [validationError, setValidationError] = useState<string>("");
  const [appliedNotice, setAppliedNotice] = useState<string>("");

  // 3. Post-Machining Actual Measurement (Inside Advanced Drawer)
  const [actualMrrInput, setActualMrrInput] = useState<string>("");
  const [actualTwrInput, setActualTwrInput] = useState<string>("");
  const [newExpId, setNewExpId] = useState<string>(`EXP-${Date.now().toString().slice(-4)}`);
  const [notesInput, setNotesInput] = useState<string>("");

  // 4. Historical Validation Table Mode (Inside Advanced Drawer)
  // Default to "fit" (In-Sample Training Fidelity) matching Shailesh Sir Table 4 architecture,
  // with an explicit toggle to "holdout" (Grouped 5-Fold Cross-Validation Generalization).
  const [validationMode, setValidationMode] = useState<"fit" | "holdout">("fit");
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("sr_no");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // 5. Future Experiments Log (Inside Advanced Drawer)
  const [futureExperiments, setFutureExperiments] = useState<FutureExperimentRecord[]>([]);
  const [editingActualId, setEditingActualId] = useState<string | null>(null);
  const [editActualMrr, setEditActualMrr] = useState<string>("");
  const [editActualTwr, setEditActualTwr] = useState<string>("");

  // Run initial prediction on load so cards are immediately informative
  useEffect(() => {
    runPrediction(30, 50, 400, 6);
    setFutureExperiments(loadFutureExperiments());
  }, []);

  const runPrediction = (ip: number, vg: number, ton: number, toff: number) => {
    if (!Number.isFinite(ip) || !Number.isFinite(vg) || !Number.isFinite(ton) || !Number.isFinite(toff)) {
      setValidationError("Please enter valid finite integer values for all four EDM parameters.");
      return;
    }
    setValidationError("");
    const res = predictPhysicalMl({
      current_A: Number(ip),
      voltage_V: Number(vg),
      ton_us: Number(ton),
      toff_us: Number(toff),
    });
    setPrediction(res);
  };

  const handlePredict = () => {
    runPrediction(ipVal, vgVal, tonVal, toffVal);
  };

  const handleApplyToTwin = () => {
    if (onApplyToMachine) {
      onApplyToMachine({
        current: ipVal,
        voltage: vgVal,
        pulseOn: tonVal,
        pulseOff: toffVal,
      });
      setAppliedNotice(`Applied to Digital Twin: Ip=${ipVal}A, Vg=${vgVal}V, TON=${tonVal}µs, TOFF=${toffVal}µs`);
      setTimeout(() => setAppliedNotice(""), 4000);
    }
  };

  const handleLoadExperiment = (exp: HistoricalPhysicalExperiment) => {
    setIpVal(exp.Ip);
    setVgVal(exp.Vg);
    setTonVal(exp.Ton);
    setToffVal(exp.Toff);
    runPrediction(exp.Ip, exp.Vg, exp.Ton, exp.Toff);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Evaluate Single Actual Validation
  const currentActualMrr = actualMrrInput.trim() !== "" ? parseFloat(actualMrrInput) : null;
  const currentActualTwr = actualTwrInput.trim() !== "" ? parseFloat(actualTwrInput) : null;
  const singleValidation = prediction
    ? evaluateActualVsPredicted(
        prediction.predicted_mrr,
        prediction.predicted_twr,
        currentActualMrr,
        currentActualTwr,
        5.0
      )
    : null;

  // Save prediction & actuals to experiment history
  const handleSaveToHistory = () => {
    if (!prediction) return;
    const actMrr = actualMrrInput.trim() !== "" ? parseFloat(actualMrrInput) : null;
    const actTwr = actualTwrInput.trim() !== "" ? parseFloat(actualTwrInput) : null;

    const val = evaluateActualVsPredicted(prediction.predicted_mrr, prediction.predicted_twr, actMrr, actTwr, 5.0);

    const record: FutureExperimentRecord = {
      experiment_id: newExpId.trim() || `EXP-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      Ip: ipVal,
      Vg: vgVal,
      Ton: tonVal,
      Toff: toffVal,
      predicted_mrr: prediction.predicted_mrr,
      predicted_twr: prediction.predicted_twr,
      actual_mrr: actMrr,
      actual_twr: actTwr,
      mrr_abs_error: val.mrr.abs_error,
      twr_abs_error: val.twr.abs_error,
      mrr_pct_error: val.mrr.pct_error,
      twr_pct_error: val.twr.pct_error,
      mrr_meets_target: val.mrr.status === "within_target",
      twr_meets_target: val.twr.status === "within_target",
      model_version: prediction.model_version,
      notes: notesInput.trim(),
    };

    const updated = saveFutureExperiment(record);
    setFutureExperiments(updated);
    setNewExpId(`EXP-${(Date.now() + 1).toString().slice(-4)}`);
    setNotesInput("");
  };

  const handleSaveInlineActuals = (id: string) => {
    const actMrr = parseFloat(editActualMrr);
    const actTwr = parseFloat(editActualTwr);
    if (!Number.isFinite(actMrr) || !Number.isFinite(actTwr)) return;
    const updated = updateFutureExperimentActuals(id, actMrr, actTwr, 5.0);
    setFutureExperiments(updated);
    setEditingActualId(null);
    setEditActualMrr("");
    setEditActualTwr("");
  };

  const handleExportCsv = () => {
    const csv = exportFutureExperimentsCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `edm_physical_experiments_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJson = () => {
    const jsonStr = exportFutureExperimentsJson();
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `edm_physical_experiments_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteRecord = (id: string) => {
    if (window.confirm(`Delete experiment ${id} from browser history?`)) {
      setFutureExperiments(deleteFutureExperiment(id));
    }
  };

  // ── Process & Sort Historical Experiments Dynamically ──
  const processedHistoricalRows = useMemo(() => {
    return historicalExperiments.map((exp) => {
      // In In-Sample Fit mode, use train_pred (the live production model's prediction).
      // In Holdout mode, use oof_pred (the out-of-fold generalization prediction).
      const pred_mrr = validationMode === "fit" ? exp.train_pred_mrr : exp.oof_pred_mrr;
      const pred_twr = validationMode === "fit" ? exp.train_pred_twr : exp.oof_pred_twr;

      // Standard error formula: abs(predicted - actual) / abs(actual) * 100
      // Explicitly guard against zero or near-zero denominators.
      const mrr_err_pct =
        exp.actual_mrr != null && Math.abs(exp.actual_mrr) > 1e-7
          ? (Math.abs(pred_mrr - exp.actual_mrr) / Math.abs(exp.actual_mrr)) * 100
          : null;

      const twr_err_pct =
        exp.actual_twr != null && Math.abs(exp.actual_twr) > 1e-7
          ? (Math.abs(pred_twr - exp.actual_twr) / Math.abs(exp.actual_twr)) * 100
          : null;

      const mrr_within_5 = mrr_err_pct !== null && mrr_err_pct <= 5.0;
      const twr_within_5 = twr_err_pct !== null && twr_err_pct <= 5.0;

      const is_major = exp.Ip >= 20 && exp.Ton >= 200;

      return {
        ...exp,
        pred_mrr,
        pred_twr,
        mrr_err_pct,
        twr_err_pct,
        mrr_within_5,
        twr_within_5,
        is_major,
      };
    });
  }, [historicalExperiments, validationMode]);

  // Filter rows
  const filteredRows = useMemo(() => {
    return processedHistoricalRows.filter((row) => {
      // Category filter
      if (filterCategory === "mrr_gt_5" && row.mrr_within_5) return false;
      if (filterCategory === "twr_gt_5" && row.twr_within_5) return false;
      if (filterCategory === "both_le_5" && (!row.mrr_within_5 || !row.twr_within_5)) return false;
      if (filterCategory === "major" && !row.is_major) return false;

      // Text query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          row.sr_no.toString().includes(q) ||
          row.Ip.toString().includes(q) ||
          row.Vg.toString().includes(q) ||
          row.Ton.toString().includes(q) ||
          row.Toff.toString().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [processedHistoricalRows, filterCategory, searchQuery]);

  // Sort rows
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortField] ?? -Infinity;
      const bVal = b[sortField] ?? -Infinity;
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredRows, sortField, sortOrder]);

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // ── Compute Summary Metrics DYNAMICALLY from Displayed Rows ──
  const dynamicSummary = useMemo(() => {
    const total = filteredRows.length;
    if (total === 0) {
      return {
        total: 0,
        mrrWithin5Count: 0,
        mrrWithin5Pct: 0,
        twrWithin5Count: 0,
        twrWithin5Pct: 0,
        bothWithin5Count: 0,
        bothWithin5Pct: 0,
        mrrMae: 0,
        twrMae: 0,
        mrrR2: 0,
        twrR2: 0,
        mrrMape: 0,
        twrMape: 0,
      };
    }

    const mrrWithin5Count = filteredRows.filter((r) => r.mrr_within_5).length;
    const mrrWithin5Pct = (mrrWithin5Count / total) * 100;

    const twrWithin5Count = filteredRows.filter((r) => r.twr_within_5).length;
    const twrWithin5Pct = (twrWithin5Count / total) * 100;

    const bothWithin5Count = filteredRows.filter((r) => r.mrr_within_5 && r.twr_within_5).length;
    const bothWithin5Pct = (bothWithin5Count / total) * 100;

    const mrrMae = filteredRows.reduce((acc, r) => acc + Math.abs(r.pred_mrr - r.actual_mrr), 0) / total;
    const twrMae = filteredRows.reduce((acc, r) => acc + Math.abs(r.pred_twr - r.actual_twr), 0) / total;

    const meanActualMrr = filteredRows.reduce((acc, r) => acc + r.actual_mrr, 0) / total;
    const meanActualTwr = filteredRows.reduce((acc, r) => acc + r.actual_twr, 0) / total;

    const ssTotMrr = filteredRows.reduce((acc, r) => acc + Math.pow(r.actual_mrr - meanActualMrr, 2), 0);
    const ssResMrr = filteredRows.reduce((acc, r) => acc + Math.pow(r.actual_mrr - r.pred_mrr, 2), 0);
    const mrrR2 = ssTotMrr > 1e-12 ? 1 - ssResMrr / ssTotMrr : 0;

    const ssTotTwr = filteredRows.reduce((acc, r) => acc + Math.pow(r.actual_twr - meanActualTwr, 2), 0);
    const ssResTwr = filteredRows.reduce((acc, r) => acc + Math.pow(r.actual_twr - r.pred_twr, 2), 0);
    const twrR2 = ssTotTwr > 1e-12 ? 1 - ssResTwr / ssTotTwr : 0;

    const validMrrApes = filteredRows.map((r) => r.mrr_err_pct).filter((v): v is number => v !== null);
    const mrrMape = validMrrApes.length > 0 ? validMrrApes.reduce((a, b) => a + b, 0) / validMrrApes.length : 0;

    const validTwrApes = filteredRows.map((r) => r.twr_err_pct).filter((v): v is number => v !== null);
    const twrMape = validTwrApes.length > 0 ? validTwrApes.reduce((a, b) => a + b, 0) / validTwrApes.length : 0;

    return {
      total,
      mrrWithin5Count,
      mrrWithin5Pct,
      twrWithin5Count,
      twrWithin5Pct,
      bothWithin5Count,
      bothWithin5Pct,
      mrrMae,
      twrMae,
      mrrR2,
      twrR2,
      mrrMape,
      twrMape,
    };
  }, [filteredRows]);

  return (
    <div className="space-y-4">
      {/* ── 1. Minimal Model Header & Domain Status ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-plant-line bg-plant-deck p-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-plant-cyan" />
          <span className="text-xs font-bold uppercase tracking-wider text-plant-text">
            Physical EDM Machine Ensemble Model
          </span>
          <StatusPill label={modelInfo?.model_version ? modelInfo.model_version.replace("physical-edm-ensemble-", "v") : "v2.3.0"} tone="green" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-plant-muted">
          <span>
            Real Runs: <strong className="text-plant-text">{modelInfo?.row_count ?? 36}</strong>
          </span>
          <span>•</span>
          <span>
            Holdout CV R²:{" "}
            <strong className="text-plant-cyan">MRR {safeFmt(historicalSummary?.oof_metrics?.mrr?.r2, 3)}</strong>,{" "}
            <strong className="text-plant-cyan">TWR {safeFmt(historicalSummary?.oof_metrics?.twr?.r2, 3)}</strong>
          </span>
          <span>•</span>
          <span className="text-emerald-400 font-mono">
            Major Conditions: TWR MedAPE {safeFmt(historicalSummary?.oof_metrics?.twr_major?.median_ape_percent, 1)}% ({safeFmt(historicalSummary?.oof_metrics?.twr_major?.pct_within_10, 0)}% ≤ 10%)
          </span>
        </div>
      </div>

      {/* ── 2. Primary Engineering Control Box: 4 Integer Inputs + Predict Button ── */}
      <div className="rounded border border-plant-line bg-plant-deck p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-plant-line/60 pb-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-plant-cyan">
            EDM Machining Parameters
          </div>
          <div className="text-[10px] text-plant-muted font-mono">
            Keyboard typing, numpad, and arrow keys supported (Enter to calculate)
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <IntegerParameterInput
            id="param-ip"
            label="Peak Current (Ip)"
            unit="A"
            min={inputRanges?.Ip?.min ?? 10}
            max={inputRanges?.Ip?.max ?? 40}
            step={1}
            value={ipVal}
            onChange={setIpVal}
            onEnter={handlePredict}
          />
          <IntegerParameterInput
            id="param-vg"
            label="Gap Voltage (Vg)"
            unit="V"
            min={inputRanges?.Vg?.min ?? 40}
            max={inputRanges?.Vg?.max ?? 55}
            step={1}
            value={vgVal}
            onChange={setVgVal}
            onEnter={handlePredict}
          />
          <IntegerParameterInput
            id="param-ton"
            label="Pulse ON Time (TON)"
            unit="µs"
            min={inputRanges?.Ton?.min ?? 100}
            max={inputRanges?.Ton?.max ?? 1500}
            step={10}
            value={tonVal}
            onChange={setTonVal}
            onEnter={handlePredict}
          />
          <IntegerParameterInput
            id="param-toff"
            label="Pulse OFF Time (TOFF)"
            unit="µs"
            min={inputRanges?.Toff?.min ?? 4}
            max={inputRanges?.Toff?.max ?? 12}
            step={1}
            value={toffVal}
            onChange={setToffVal}
            onEnter={handlePredict}
          />
        </div>

        {/* Action Buttons: 1 Primary Predict Button + 1 Apply to Twin Button */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePredict}
            className="flex items-center gap-2 rounded bg-plant-cyan px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-plant-void shadow-md hover:bg-plant-cyan/90 transition"
          >
            <Activity className="h-4 w-4" />
            Predict MRR &amp; TWR
          </button>

          {onApplyToMachine && (
            <button
              type="button"
              onClick={handleApplyToTwin}
              className="flex items-center gap-2 rounded border border-plant-line bg-plant-void px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-plant-muted hover:border-plant-cyan hover:text-plant-text transition"
            >
              <Sliders className="h-4 w-4 text-plant-cyan" />
              Apply to Twin Parameters
            </button>
          )}

          {appliedNotice && (
            <span className="text-xs font-mono text-emerald-400">
              ✓ {appliedNotice}
            </span>
          )}
        </div>

        {validationError && (
          <div className="mt-3 rounded border border-plant-red/60 bg-plant-red/10 p-3 text-xs text-plant-red">
            {validationError}
          </div>
        )}
      </div>

      {/* ── 3. Two Clear Output Cards: Predicted MRR & TWR ── */}
      {prediction && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Output 1: Predicted MRR */}
            <div className="rounded border border-plant-green/50 bg-plant-deck p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-plant-muted">
                  Material Removal Rate (MRR)
                </span>
                <span className="rounded bg-plant-green/15 px-2 py-0.5 text-[9px] font-bold text-plant-green">
                  PREDICTED OUTPUT
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-extrabold text-plant-green tracking-tight">
                  {prediction.predicted_mrr.toFixed(5)}
                </span>
                <span className="font-mono text-xs font-bold text-plant-muted">
                  {prediction.mrr_unit}
                </span>
                {prediction.mrr_uncertainty !== undefined && (
                  <span className="text-[11px] font-mono text-plant-muted">
                    ± {prediction.mrr_uncertainty.toFixed(5)}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-plant-muted border-t border-plant-line/40 pt-2 font-mono">
                <span>Holdout R²: {safeFmt(historicalSummary?.oof_metrics?.mrr?.r2, 3)}</span>
                <span>MAE: {safeFmt(historicalSummary?.oof_metrics?.mrr?.mae, 5)} g/min</span>
              </div>
            </div>

            {/* Output 2: Predicted TWR */}
            <div className="rounded border border-plant-cyan/50 bg-plant-deck p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-plant-muted">
                  Tool Wear Rate (TWR)
                </span>
                <span className="rounded bg-plant-cyan/15 px-2 py-0.5 text-[9px] font-bold text-plant-cyan">
                  PREDICTED OUTPUT
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-extrabold text-plant-cyan tracking-tight">
                  {prediction.predicted_twr.toFixed(5)}
                </span>
                <span className="font-mono text-xs font-bold text-plant-muted">
                  {prediction.twr_unit}
                </span>
                {prediction.twr_uncertainty !== undefined && (
                  <span className="text-[11px] font-mono text-plant-muted">
                    ± {prediction.twr_uncertainty.toFixed(5)}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-plant-muted border-t border-plant-line/40 pt-2 font-mono">
                <span>Holdout R²: {safeFmt(historicalSummary?.oof_metrics?.twr?.r2, 3)}</span>
                <span>Major MAPE: {safeFmt(historicalSummary?.oof_metrics?.twr_major?.mape_percent, 2)}%</span>
              </div>
            </div>

            {/* Operating Domain Status */}
            <div className="rounded border border-plant-line bg-plant-deck p-4 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-plant-muted">
                  Operating Envelope
                </span>
                <StatusPill
                  label={prediction.domain_status === "in_domain" ? "IN DOMAIN" : "EXTRAPOLATED"}
                  tone={prediction.domain_status === "in_domain" ? "green" : "amber"}
                />
              </div>
              <div className="mt-2 text-xs text-plant-muted leading-relaxed">
                {prediction.domain_status === "in_domain"
                  ? "✓ All setpoints within calibrated physical envelope."
                  : "⚠ Input setpoints fall outside calibrated envelope."}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-plant-line/40 pt-2 text-[10px] text-plant-muted font-mono">
                <span>Evaluated by 60-tree Random Forest ensemble</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. Collapsible Advanced Validation Drawer ── */}
      <details className="group rounded border border-plant-line bg-plant-void/50 p-4 transition">
        <summary className="flex cursor-pointer items-center justify-between font-mono text-xs font-semibold uppercase tracking-wider text-plant-muted hover:text-plant-cyan">
          <div className="flex items-center gap-2">
            <span className="text-plant-cyan font-bold">Advanced Validation &amp; Experimental History</span>
            <span className="text-[10px] text-plant-muted">
              ({modelInfo?.row_count ?? 48} Calibration Runs • Error Analysis • Experiment Logging)
            </span>
          </div>
          <span className="text-plant-muted group-open:rotate-180 transition-transform">▼</span>
        </summary>

        <div className="mt-4 space-y-5 border-t border-plant-line/60 pt-4">
          {/* Subsection A: Single Actual Run Measurement Validation */}
          <div className="rounded border border-plant-line bg-plant-deck p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-plant-cyan">
              A. Post-Machining Actual Measurement Validation (≤5.0% Target)
            </div>
            <p className="mt-1 text-xs text-plant-muted">
              Record physical mass measurements after cut completion to verify model accuracy against the engineering 5% target.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-[10px] uppercase text-plant-muted">Measured Actual MRR</label>
                <div className="mt-1 flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className="h-9 sm:h-10 w-full rounded border border-plant-line bg-plant-void px-2.5 font-mono text-xs sm:text-sm text-plant-text outline-none focus:border-plant-cyan"
                    value={actualMrrInput}
                    onChange={(e) => setActualMrrInput(e.target.value.replace(",", "."))}
                    onFocus={(e) => e.target.select()}
                    placeholder="e.g. 0.0359"
                    aria-label="Measured Actual MRR in g/min"
                  />
                  <span className="text-[10px] text-plant-muted">g/min</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase text-plant-muted">Measured Actual TWR</label>
                <div className="mt-1 flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className="h-9 sm:h-10 w-full rounded border border-plant-line bg-plant-void px-2.5 font-mono text-xs sm:text-sm text-plant-text outline-none focus:border-plant-cyan"
                    value={actualTwrInput}
                    onChange={(e) => setActualTwrInput(e.target.value.replace(",", "."))}
                    onFocus={(e) => e.target.select()}
                    placeholder="e.g. 0.0218"
                    aria-label="Measured Actual TWR in g/min"
                  />
                  <span className="text-[10px] text-plant-muted">g/min</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase text-plant-muted">Experiment ID</label>
                <input
                  type="text"
                  className="mt-1 h-8 w-full rounded border border-plant-line bg-plant-void px-2 font-mono text-xs text-plant-text outline-none focus:border-plant-cyan"
                  value={newExpId}
                  onChange={(e) => setNewExpId(e.target.value)}
                  placeholder="EXP-01"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-plant-muted">Notes</label>
                <input
                  type="text"
                  className="mt-1 h-8 w-full rounded border border-plant-line bg-plant-void px-2 text-xs text-plant-text outline-none focus:border-plant-cyan"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Operator / workpiece"
                />
              </div>
            </div>

            {/* Validation Result Table */}
            {singleValidation && (
              <div className="mt-3 overflow-x-auto border border-plant-line/60 rounded">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-plant-void border-b border-plant-line text-[10px] uppercase tracking-wider text-plant-muted">
                    <tr>
                      <th className="p-2">Target</th>
                      <th className="p-2">Predicted</th>
                      <th className="p-2">Actual Measured</th>
                      <th className="p-2">Absolute Error</th>
                      <th className="p-2">Percentage Error</th>
                      <th className="p-2 text-center">Engineering Target (≤5.0%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-plant-line/40 bg-plant-deck">
                    <tr>
                      <td className="p-2 font-bold text-plant-green">MRR</td>
                      <td className="p-2 font-mono">{singleValidation.mrr.predicted.toFixed(5)} g/min</td>
                      <td className="p-2 font-mono">
                        {singleValidation.mrr.actual !== null ? `${singleValidation.mrr.actual.toFixed(5)} g/min` : "Awaiting Measurement"}
                      </td>
                      <td className="p-2 font-mono">
                        {singleValidation.mrr.abs_error !== null ? `${singleValidation.mrr.abs_error.toFixed(5)} g/min` : "—"}
                      </td>
                      <td className="p-2 font-mono font-bold">
                        {singleValidation.mrr.pct_error !== null ? `${singleValidation.mrr.pct_error.toFixed(2)}%` : "—"}
                      </td>
                      <td className="p-2 text-center">
                        {singleValidation.mrr.status === "within_target" ? (
                          <span className="rounded bg-plant-green/15 px-2 py-0.5 text-[10px] font-bold text-plant-green">
                            ✓ WITHIN ≤5% TARGET
                          </span>
                        ) : singleValidation.mrr.status === "above_target" ? (
                          <span className="rounded bg-plant-amber/15 px-2 py-0.5 text-[10px] font-bold text-plant-amber">
                            ⚠ &gt;5% ERROR
                          </span>
                        ) : (
                          <span className="text-plant-muted text-[10px]">ENTER ACTUAL</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-plant-cyan">TWR</td>
                      <td className="p-2 font-mono">{singleValidation.twr.predicted.toFixed(5)} g/min</td>
                      <td className="p-2 font-mono">
                        {singleValidation.twr.actual !== null ? `${singleValidation.twr.actual.toFixed(5)} g/min` : "Awaiting Measurement"}
                      </td>
                      <td className="p-2 font-mono">
                        {singleValidation.twr.abs_error !== null ? `${singleValidation.twr.abs_error.toFixed(5)} g/min` : "—"}
                      </td>
                      <td className="p-2 font-mono font-bold">
                        {singleValidation.twr.pct_error !== null ? `${singleValidation.twr.pct_error.toFixed(2)}%` : "—"}
                      </td>
                      <td className="p-2 text-center">
                        {singleValidation.twr.status === "within_target" ? (
                          <span className="rounded bg-plant-green/15 px-2 py-0.5 text-[10px] font-bold text-plant-green">
                            ✓ WITHIN ≤5% TARGET
                          </span>
                        ) : singleValidation.twr.status === "above_target" ? (
                          <span className="rounded bg-plant-amber/15 px-2 py-0.5 text-[10px] font-bold text-plant-amber">
                            ⚠ &gt;5% ERROR
                          </span>
                        ) : (
                          <span className="text-plant-muted text-[10px]">ENTER ACTUAL</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveToHistory}
                className="flex items-center gap-1.5 rounded bg-plant-cyan/20 border border-plant-cyan/40 px-3 py-1.5 text-xs font-semibold text-plant-cyan hover:bg-plant-cyan/30 transition"
              >
                <Save className="h-3.5 w-3.5" />
                Save Run to Physical History Log
              </button>
            </div>
          </div>

          {/* Subsection B: Historical Physical Dataset Validation (36 Real Runs) */}
          <div className="rounded border border-plant-line bg-plant-deck p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-plant-cyan">
                  B. Real Experimental Calibration Validation (N = {modelInfo?.row_count ?? 48} Real Runs)
                </div>
                <p className="mt-1 text-xs text-plant-muted">
                  {validationMode === "fit"
                    ? "In-Sample Model Fit: Evaluates each physical experiment with the active production Random Forest (exact analog of Shailesh Sir Table 4 validation)."
                    : "Holdout Cross-Validation: Evaluates each physical experiment when its condition group was held out during 5-fold cross-validation (generalization claim)."}
                </p>
              </div>

              {/* Explicit Mode Switcher */}
              <div className="flex rounded border border-plant-line bg-plant-void p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setValidationMode("fit")}
                  className={`rounded px-3 py-1.5 transition ${
                    validationMode === "fit"
                      ? "bg-plant-cyan text-plant-void shadow-sm"
                      : "text-plant-muted hover:text-plant-text"
                  }`}
                >
                  In-Sample Model Fit (Fidelity)
                </button>
                <button
                  type="button"
                  onClick={() => setValidationMode("holdout")}
                  className={`rounded px-3 py-1.5 transition ${
                    validationMode === "holdout"
                      ? "bg-plant-cyan text-plant-void shadow-sm"
                      : "text-plant-muted hover:text-plant-text"
                  }`}
                >
                  Holdout CV (Generalization)
                </button>
              </div>
            </div>


            {/* Dynamic Summary Cards calculated directly from displayed rows */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded border border-plant-line bg-plant-void p-3">
                <div className="text-[10px] uppercase text-plant-muted">
                  MRR Performance ({validationMode === "fit" ? "Model Fit" : "Holdout OOF"})
                </div>
                <div className="mt-1 text-sm font-mono font-bold text-plant-text">
                  MAE: {safeFmt(dynamicSummary.mrrMae, 5)} g/min
                </div>
                <div className="text-[10px] text-plant-muted font-mono flex justify-between mt-1">
                  <span>R²: {safeFmt(dynamicSummary.mrrR2, 3)}</span>
                  <span>MAPE: {safeFmt(dynamicSummary.mrrMape, 1)}%</span>
                </div>
              </div>

              <div className="rounded border border-plant-line bg-plant-void p-3">
                <div className="text-[10px] uppercase text-plant-muted">
                  TWR Performance ({validationMode === "fit" ? "Model Fit" : "Holdout OOF"})
                </div>
                <div className="mt-1 text-sm font-mono font-bold text-plant-text">
                  MAE: {safeFmt(dynamicSummary.twrMae, 5)} g/min
                </div>
                <div className="text-[10px] text-plant-muted font-mono flex justify-between mt-1">
                  <span>R²: {safeFmt(dynamicSummary.twrR2, 3)}</span>
                  <span>MAPE: {safeFmt(dynamicSummary.twrMape, 1)}%</span>
                </div>
              </div>

              <div className="rounded border border-plant-line bg-plant-void p-3">
                <div className="text-[10px] uppercase text-plant-muted">MRR ≤ 5% Target</div>
                <div className="mt-1 text-sm font-mono font-bold text-emerald-400">
                  {dynamicSummary.mrrWithin5Count} / {dynamicSummary.total} Runs
                </div>
                <div className="text-[10px] text-plant-muted font-mono">
                  Pass Rate: {safeFmt(dynamicSummary.mrrWithin5Pct, 1)}%
                </div>
              </div>

              <div className="rounded border border-plant-line bg-plant-void p-3">
                <div className="text-[10px] uppercase text-plant-muted">TWR ≤ 5% Target</div>
                <div className="mt-1 text-sm font-mono font-bold text-emerald-400">
                  {dynamicSummary.twrWithin5Count} / {dynamicSummary.total} Runs
                </div>
                <div className="text-[10px] text-plant-muted font-mono">
                  Pass Rate: {safeFmt(dynamicSummary.twrWithin5Pct, 1)}%
                </div>
              </div>

              <div className="rounded border border-plant-line bg-plant-void p-3">
                <div className="text-[10px] uppercase text-plant-muted">Both ≤ 5% Target</div>
                <div className="mt-1 text-sm font-mono font-bold text-emerald-400">
                  {dynamicSummary.bothWithin5Count} / {dynamicSummary.total} Runs
                </div>
                <div className="text-[10px] text-plant-muted font-mono">
                  Joint Rate: {safeFmt(dynamicSummary.bothWithin5Pct, 1)}%
                </div>
              </div>
            </div>

            {/* Quick Filters & Search */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-plant-muted mr-1">
                  <Filter className="h-3 w-3" /> Filter:
                </span>
                <button
                  type="button"
                  onClick={() => setFilterCategory("all")}
                  className={`rounded px-2.5 py-1 text-xs transition ${
                    filterCategory === "all"
                      ? "bg-plant-cyan/20 border border-plant-cyan text-plant-cyan font-bold"
                      : "border border-plant-line bg-plant-void text-plant-muted hover:text-plant-text"
                  }`}
                >
                  All {historicalExperiments.length} Runs
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory("major")}
                  className={`rounded px-2.5 py-1 text-xs transition ${
                    filterCategory === "major"
                      ? "bg-plant-cyan/20 border border-plant-cyan text-plant-cyan font-bold"
                      : "border border-plant-line bg-plant-void text-plant-muted hover:text-plant-text"
                  }`}
                >
                  Major Conditions
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory("both_le_5")}
                  className={`rounded px-2.5 py-1 text-xs transition ${
                    filterCategory === "both_le_5"
                      ? "bg-emerald-500/20 border border-emerald-500 text-emerald-400 font-bold"
                      : "border border-plant-line bg-plant-void text-plant-muted hover:text-plant-text"
                  }`}
                >
                  Both ≤ 5%
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory("mrr_gt_5")}
                  className={`rounded px-2.5 py-1 text-xs transition ${
                    filterCategory === "mrr_gt_5"
                      ? "bg-amber-500/20 border border-amber-500 text-amber-400 font-bold"
                      : "border border-plant-line bg-plant-void text-plant-muted hover:text-plant-text"
                  }`}
                >
                  MRR &gt; 5% Error
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory("twr_gt_5")}
                  className={`rounded px-2.5 py-1 text-xs transition ${
                    filterCategory === "twr_gt_5"
                      ? "bg-amber-500/20 border border-amber-500 text-amber-400 font-bold"
                      : "border border-plant-line bg-plant-void text-plant-muted hover:text-plant-text"
                  }`}
                >
                  TWR &gt; 5% Error
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="h-8 w-48 rounded border border-plant-line bg-plant-void px-2 text-xs font-mono text-plant-text outline-none focus:border-plant-cyan"
                  placeholder="Filter by Sr. No or param..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="text-[11px] text-plant-muted">
                  Showing {sortedRows.length} of {historicalExperiments.length}
                </span>
              </div>
            </div>

            {/* Validation Table with Interactive Sorting and Testing */}
            <div className="mt-3 overflow-x-auto max-h-80 border border-plant-line/60 rounded">
              <table className="w-full text-left text-xs min-w-[980px]">
                <thead className="sticky top-0 bg-plant-void border-b border-plant-line text-[10px] uppercase tracking-wider text-plant-muted">
                  <tr>
                    <th className="p-2 cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("sr_no")}>
                      <span className="flex items-center gap-1">
                        Expt <ArrowUpDown className="h-2.5 w-2.5" />
                      </span>
                    </th>
                    <th className="p-2 text-right cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("Ip")}>
                      Ip (A)
                    </th>
                    <th className="p-2 text-right cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("Vg")}>
                      Vg (V)
                    </th>
                    <th className="p-2 text-right cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("Ton")}>
                      TON (µs)
                    </th>
                    <th className="p-2 text-right cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("Toff")}>
                      TOFF (µs)
                    </th>
                    <th className="p-2 text-right cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("actual_mrr")}>
                      Actual MRR
                    </th>
                    <th className="p-2 text-right cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("pred_mrr")}>
                      {validationMode === "fit" ? "Pred MRR (Fit)" : "Pred MRR (OOF)"}
                    </th>
                    <th className="p-2 text-right cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("mrr_err_pct")}>
                      <span className="flex items-center justify-end gap-1">
                        MRR Err% <ArrowUpDown className="h-2.5 w-2.5" />
                      </span>
                    </th>
                    <th className="p-2 text-center">MRR Status</th>
                    <th className="p-2 text-right cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("actual_twr")}>
                      Actual TWR
                    </th>
                    <th className="p-2 text-right cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("pred_twr")}>
                      {validationMode === "fit" ? "Pred TWR (Fit)" : "Pred TWR (OOF)"}
                    </th>
                    <th className="p-2 text-right cursor-pointer hover:text-plant-cyan" onClick={() => handleToggleSort("twr_err_pct")}>
                      <span className="flex items-center justify-end gap-1">
                        TWR Err% <ArrowUpDown className="h-2.5 w-2.5" />
                      </span>
                    </th>
                    <th className="p-2 text-center">TWR Status</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-plant-line/40 bg-plant-deck">
                  {sortedRows.map((row) => (
                    <tr key={row.sr_no} className="hover:bg-plant-void/40 text-plant-text font-mono text-[11px]">
                      <td className="p-2 font-bold text-plant-cyan">#{row.sr_no}</td>
                      <td className="p-2 text-right">{row.Ip}</td>
                      <td className="p-2 text-right">{row.Vg}</td>
                      <td className="p-2 text-right">{row.Ton}</td>
                      <td className="p-2 text-right">{row.Toff}</td>
                      <td className="p-2 text-right">{safeFmt(row.actual_mrr, 4)}</td>
                      <td className="p-2 text-right text-plant-muted">{safeFmt(row.pred_mrr, 4)}</td>
                      <td className="p-2 text-right font-semibold">
                        {row.mrr_err_pct != null && Number.isFinite(row.mrr_err_pct) ? `${row.mrr_err_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="p-2 text-center">
                        {row.mrr_within_5 ? (
                          <span className="rounded bg-plant-green/15 px-1.5 py-0.5 text-[9px] font-bold text-plant-green">
                            ≤5% MET
                          </span>
                        ) : (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                            &gt;5%
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right">{safeFmt(row.actual_twr, 4)}</td>
                      <td className="p-2 text-right text-plant-muted">{safeFmt(row.pred_twr, 4)}</td>
                      <td className="p-2 text-right font-semibold">
                        {row.twr_err_pct != null && Number.isFinite(row.twr_err_pct) ? `${row.twr_err_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="p-2 text-center">
                        {row.twr_within_5 ? (
                          <span className="rounded bg-plant-green/15 px-1.5 py-0.5 text-[9px] font-bold text-plant-green">
                            ≤5% MET
                          </span>
                        ) : (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                            &gt;5%
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleLoadExperiment(row)}
                          title={`Load condition #${row.sr_no} into predictor`}
                          className="rounded border border-plant-line bg-plant-void px-2 py-0.5 text-[10px] text-plant-cyan hover:border-plant-cyan hover:text-plant-text transition"
                        >
                          Test
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Subsection C: Logged Future Experiments */}
          <div className="rounded border border-plant-line bg-plant-deck p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-plant-cyan">
                  C. Logged Physical EDM Experiments (Local Storage)
                </div>
                <p className="mt-1 text-xs text-plant-muted">
                  Preserves past run inputs, model predictions, and post-machining verified measurements.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={futureExperiments.length === 0}
                  className="flex items-center gap-1.5 rounded border border-plant-line bg-plant-void px-2.5 py-1 text-xs font-semibold text-plant-text hover:border-plant-cyan disabled:opacity-40"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-plant-cyan" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  disabled={futureExperiments.length === 0}
                  className="flex items-center gap-1.5 rounded border border-plant-line bg-plant-void px-2.5 py-1 text-xs font-semibold text-plant-text hover:border-plant-cyan disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5 text-plant-cyan" />
                  Export JSON
                </button>
              </div>
            </div>

            {futureExperiments.length === 0 ? (
              <div className="mt-3 rounded border border-dashed border-plant-line bg-plant-void p-4 text-center text-xs text-plant-muted">
                No future physical experiments logged yet. Generate a prediction and save records above.
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto max-h-64 border border-plant-line/60 rounded">
                <table className="w-full text-left text-xs min-w-[950px]">
                  <thead className="sticky top-0 bg-plant-void border-b border-plant-line text-[10px] uppercase tracking-wider text-plant-muted">
                    <tr>
                      <th className="p-2">ID</th>
                      <th className="p-2">Timestamp</th>
                      <th className="p-2 text-right">Ip/Vg/Ton/Toff</th>
                      <th className="p-2 text-right">Pred MRR</th>
                      <th className="p-2 text-right">Actual MRR</th>
                      <th className="p-2 text-right">MRR Err%</th>
                      <th className="p-2 text-right">Pred TWR</th>
                      <th className="p-2 text-right">Actual TWR</th>
                      <th className="p-2 text-right">TWR Err%</th>
                      <th className="p-2 text-center">Status</th>
                      <th className="p-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-plant-line/40 bg-plant-deck">
                    {futureExperiments.map((r) => {
                      const isEditing = editingActualId === r.experiment_id;
                      const hasActuals = r.actual_mrr !== null && r.actual_twr !== null;
                      return (
                        <tr key={r.experiment_id} className="hover:bg-plant-void/40 text-plant-text font-mono text-[11px]">
                          <td className="p-2 font-bold text-plant-cyan">{r.experiment_id}</td>
                          <td className="p-2 text-plant-muted text-[10px]">{r.timestamp}</td>
                          <td className="p-2 text-right">{r.Ip}/{r.Vg}/{r.Ton}/{r.Toff}</td>
                          <td className="p-2 text-right">{safeFmt(r.predicted_mrr, 4)}</td>
                          <td className="p-2 text-right">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.0001"
                                className="w-16 rounded border border-plant-cyan bg-plant-void px-1 text-[11px]"
                                value={editActualMrr}
                                onChange={(e) => setEditActualMrr(e.target.value)}
                                placeholder="MRR"
                              />
                            ) : r.actual_mrr != null && Number.isFinite(r.actual_mrr) ? (
                              safeFmt(r.actual_mrr, 4)
                            ) : (
                              <span className="text-plant-muted">—</span>
                            )}
                          </td>
                          <td className="p-2 text-right font-semibold">
                            {r.mrr_pct_error != null && Number.isFinite(r.mrr_pct_error) ? `${r.mrr_pct_error.toFixed(1)}%` : "—"}
                          </td>
                          <td className="p-2 text-right">{safeFmt(r.predicted_twr, 4)}</td>
                          <td className="p-2 text-right">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.0001"
                                className="w-16 rounded border border-plant-cyan bg-plant-void px-1 text-[11px]"
                                value={editActualTwr}
                                onChange={(e) => setEditActualTwr(e.target.value)}
                                placeholder="TWR"
                              />
                            ) : r.actual_twr != null && Number.isFinite(r.actual_twr) ? (
                              safeFmt(r.actual_twr, 4)
                            ) : (
                              <span className="text-plant-muted">—</span>
                            )}
                          </td>
                          <td className="p-2 text-right font-semibold">
                            {r.twr_pct_error != null && Number.isFinite(r.twr_pct_error) ? `${r.twr_pct_error.toFixed(1)}%` : "—"}
                          </td>
                          <td className="p-2 text-center">
                            {!hasActuals ? (
                              <span className="text-[9px] text-plant-muted">PENDING ACTUALS</span>
                            ) : r.mrr_meets_target && r.twr_meets_target ? (
                              <span className="rounded bg-plant-green/15 px-1.5 py-0.5 text-[9px] font-bold text-plant-green">
                                BOTH ≤5%
                              </span>
                            ) : r.mrr_meets_target ? (
                              <span className="rounded bg-plant-cyan/15 px-1.5 py-0.5 text-[9px] font-bold text-plant-cyan">
                                MRR ≤5%
                              </span>
                            ) : r.twr_meets_target ? (
                              <span className="rounded bg-plant-cyan/15 px-1.5 py-0.5 text-[9px] font-bold text-plant-cyan">
                                TWR ≤5%
                              </span>
                            ) : (
                              <span className="rounded bg-plant-amber/15 px-1.5 py-0.5 text-[9px] font-bold text-plant-amber">
                                &gt;5% TARGET
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {isEditing ? (
                              <button
                                type="button"
                                onClick={() => handleSaveInlineActuals(r.experiment_id)}
                                className="text-plant-green hover:underline text-[10px]"
                              >
                                Save
                              </button>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingActualId(r.experiment_id);
                                    setEditActualMrr(r.actual_mrr !== null ? String(r.actual_mrr) : "");
                                    setEditActualTwr(r.actual_twr !== null ? String(r.actual_twr) : "");
                                  }}
                                  className="text-plant-cyan hover:underline text-[10px]"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRecord(r.experiment_id)}
                                  className="text-plant-red hover:underline text-[10px]"
                                >
                                  <Trash2 className="h-3 w-3 inline" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
};
