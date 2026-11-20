import physicalArtifact from "../data/ml/physical-experimental-model.json";

export interface PhysicalMlPredictionInput {
  current_A: number; // Ip
  voltage_V: number; // Vg
  ton_us: number;    // TON
  toff_us: number;   // TOFF
}

export interface PhysicalMlPredictionResult {
  predicted_mrr: number;
  predicted_twr: number;
  mrr_uncertainty?: number;
  twr_uncertainty?: number;
  mrr_unit: string;
  twr_unit: string;
  model_version: string;
  domain_status: "in_domain" | "out_of_domain";
  warnings: string[];
}

export interface PhysicalValidationMetric {
  parameter: "MRR" | "TWR";
  predicted: number;
  actual: number | null;
  unit: string;
  abs_error: number | null;
  pct_error: number | null;
  status: "within_target" | "above_target" | "undefined";
}

export interface HistoricalPhysicalExperiment {
  sr_no: number;
  Ip: number;
  Vg: number;
  Ton: number;
  Toff: number;
  doc_mm: number;
  time_min: number;
  actual_mrr: number;
  actual_twr: number;
  fold: number;
  oof_pred_mrr: number;
  oof_pred_twr: number;
  oof_mrr_error_pct: number | null;
  oof_twr_error_pct: number | null;
  oof_mrr_meets_target: boolean;
  oof_twr_meets_target: boolean;
  train_pred_mrr: number;
  train_pred_twr: number;
  train_mrr_error_pct: number | null;
  train_twr_error_pct: number | null;
  train_mrr_meets_target: boolean;
  train_twr_meets_target: boolean;
}

export interface FutureExperimentRecord {
  experiment_id: string;
  timestamp: string;
  Ip: number;
  Vg: number;
  Ton: number;
  Toff: number;
  predicted_mrr: number;
  predicted_twr: number;
  actual_mrr: number | null;
  actual_twr: number | null;
  mrr_abs_error: number | null;
  twr_abs_error: number | null;
  mrr_pct_error: number | null;
  twr_pct_error: number | null;
  mrr_meets_target: boolean | null;
  twr_meets_target: boolean | null;
  model_version: string;
  notes?: string;
}

type Tree = {
  children_left: number[];
  children_right: number[];
  feature: number[];
  threshold: number[];
  value: number[];
};

type Forest = {
  model_type: string;
  feature_names: string[];
  trees: Tree[];
};

interface PhysicalArtifactSchema {
  metadata: {
    model_version: string;
    model_name: string;
    model_type: string;
    provenance: string;
    row_count: number;
    flagged_rows_count: number;
    candidate_rows_count: number;
    features: string[];
    feature_order: string[];
    target_units: { mrr: string; twr: string };
    input_ranges: Record<string, { min: number; max: number }>;
    metrics: {
      mrr: { grouped_5_fold_cv: { mae: number; rmse: number; r2: number; mape_percent: number } };
      twr: { grouped_5_fold_cv: { mae: number; rmse: number; r2: number; mape_percent: number } };
    };
    feature_importances: {
      mrr: Record<string, number>;
      twr: Record<string, number>;
    };
    synthetic_data_used: boolean;
    limitations: string[];
    historical_summary: {
      total_experiments: number;
      target_error_pct: number;
      oof_metrics: {
        mrr: { mae: number; rmse: number; r2: number; mape_percent: number };
        twr: { mae: number; rmse: number; r2: number; mape_percent: number };
        mrr_within_target_count: number;
        mrr_within_target_pct: number;
        twr_within_target_count: number;
        twr_within_target_pct: number;
        mrr_major?: { definition: string; n: number; mae: number; rmse: number; r2: number; mape_percent: number; median_ape_percent?: number; max_ape_percent?: number; pct_within_5: number; pct_within_10: number };
        twr_major?: { definition: string; n: number; mae: number; rmse: number; r2: number; mape_percent: number; median_ape_percent?: number; max_ape_percent?: number; pct_within_5: number; pct_within_10: number };
      };
      train_metrics: {
        mrr_mae: number;
        mrr_r2: number;
        twr_mae: number;
        twr_r2: number;
        mrr_within_target_count: number;
        mrr_within_target_pct: number;
        twr_within_target_count: number;
        twr_within_target_pct: number;
      };
    };
  };
  mrr_model: Forest;
  twr_model: Forest;
  historical_experiments: HistoricalPhysicalExperiment[];
}

const artifact = physicalArtifact as unknown as PhysicalArtifactSchema;

function evaluateForest(forest: Forest, vector: number[]): { mean: number; std: number } {
  let sum = 0;
  const values: number[] = new Array(forest.trees.length);
  for (let i = 0; i < forest.trees.length; i++) {
    const tree = forest.trees[i];
    let node = 0;
    while (tree.children_left[node] !== -1) {
      const featIdx = tree.feature[node];
      node = vector[featIdx] <= tree.threshold[node]
        ? tree.children_left[node]
        : tree.children_right[node];
    }
    const val = tree.value[node];
    values[i] = val;
    sum += val;
  }
  const mean = sum / forest.trees.length;
  let varSum = 0;
  for (let i = 0; i < values.length; i++) {
    varSum += (values[i] - mean) * (values[i] - mean);
  }
  const std = Math.sqrt(varSum / forest.trees.length);
  return { mean, std };
}

export function getPhysicalMlModelInfo() {
  return artifact.metadata;
}

export function getPhysicalMlInputRanges() {
  return artifact.metadata.input_ranges;
}

export function getPhysicalHistoricalExperiments(): HistoricalPhysicalExperiment[] {
  return artifact.historical_experiments;
}

export function getPhysicalHistoricalSummary() {
  return artifact.metadata.historical_summary;
}

export function predictPhysicalMl(input: PhysicalMlPredictionInput): PhysicalMlPredictionResult {
  const warnings: string[] = [];
  const ranges = artifact.metadata.input_ranges;

  const keyMap: Record<string, { label: string; val: number }> = {
    Ip: { label: "Peak Current (Ip)", val: input.current_A },
    Vg: { label: "Gap Voltage (Vg)", val: input.voltage_V },
    Ton: { label: "Pulse ON Time (TON)", val: input.ton_us },
    Toff: { label: "Pulse OFF Time (TOFF)", val: input.toff_us },
  };

  for (const [key, meta] of Object.entries(keyMap)) {
    if (!Number.isFinite(meta.val)) {
      warnings.push(`${meta.label} must be a finite number.`);
    } else {
      const bound = ranges[key];
      if (bound && (meta.val < bound.min || meta.val > bound.max)) {
        warnings.push(`${meta.label} = ${meta.val} is outside the training range [${bound.min}, ${bound.max}].`);
      }
    }
  }

  // Exact logical input order: [Ip, Vg, TON, TOFF]
  const vector = [input.current_A, input.voltage_V, input.ton_us, input.toff_us];
  const mrrRes = evaluateForest(artifact.mrr_model, vector);
  const twrRes = evaluateForest(artifact.twr_model, vector);

  const predicted_mrr = Math.max(0, mrrRes.mean);
  const predicted_twr = Math.max(0, twrRes.mean);

  return {
    predicted_mrr,
    predicted_twr,
    mrr_uncertainty: mrrRes.std,
    twr_uncertainty: twrRes.std,
    mrr_unit: artifact.metadata.target_units.mrr,
    twr_unit: artifact.metadata.target_units.twr,
    model_version: artifact.metadata.model_version,
    domain_status: warnings.length === 0 ? "in_domain" : "out_of_domain",
    warnings,
  };
}

export function evaluateActualVsPredicted(
  predictedMrr: number,
  predictedTwr: number,
  actualMrrInput: number | null | undefined,
  actualTwrInput: number | null | undefined,
  targetErrorPct = 5.0
): { mrr: PhysicalValidationMetric; twr: PhysicalValidationMetric } {
  function evalMetric(
    parameter: "MRR" | "TWR",
    pred: number,
    actual: number | null | undefined
  ): PhysicalValidationMetric {
    const isActValid = actual !== null && actual !== undefined && Number.isFinite(actual);
    if (!isActValid) {
      return {
        parameter,
        predicted: pred,
        actual: null,
        unit: "g/min",
        abs_error: null,
        pct_error: null,
        status: "undefined",
      };
    }

    const absErr = Math.abs(pred - actual);
    if (actual === 0) {
      return {
        parameter,
        predicted: pred,
        actual,
        unit: "g/min",
        abs_error: absErr,
        pct_error: null,
        status: absErr <= 1e-4 ? "within_target" : "above_target",
      };
    }

    const pctErr = (absErr / Math.abs(actual)) * 100;
    const status = pctErr <= targetErrorPct ? "within_target" : "above_target";
    return {
      parameter,
      predicted: pred,
      actual,
      unit: "g/min",
      abs_error: absErr,
      pct_error: pctErr,
      status,
    };
  }

  return {
    mrr: evalMetric("MRR", predictedMrr, actualMrrInput),
    twr: evalMetric("TWR", predictedTwr, actualTwrInput),
  };
}

const STORAGE_KEY = "edm_physical_future_experiments_v1";

export function loadFutureExperiments(): FutureExperimentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load future experiments from localStorage", err);
    return [];
  }
}

export function saveFutureExperiment(record: FutureExperimentRecord): FutureExperimentRecord[] {
  const current = loadFutureExperiments();
  const existingIdx = current.findIndex((item) => item.experiment_id === record.experiment_id);
  let updated: FutureExperimentRecord[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = record;
  } else {
    updated = [record, ...current];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save to localStorage", err);
  }
  return updated;
}

export function updateFutureExperimentActuals(
  experiment_id: string,
  actual_mrr: number,
  actual_twr: number,
  targetErrorPct = 5.0
): FutureExperimentRecord[] {
  const current = loadFutureExperiments();
  const idx = current.findIndex((item) => item.experiment_id === experiment_id);
  if (idx < 0) return current;

  const target = current[idx];
  const mrrVal = evaluateActualVsPredicted(target.predicted_mrr, target.predicted_twr, actual_mrr, actual_twr, targetErrorPct);

  const updatedRecord: FutureExperimentRecord = {
    ...target,
    actual_mrr,
    actual_twr,
    mrr_abs_error: mrrVal.mrr.abs_error,
    twr_abs_error: mrrVal.twr.abs_error,
    mrr_pct_error: mrrVal.mrr.pct_error,
    twr_pct_error: mrrVal.twr.pct_error,
    mrr_meets_target: mrrVal.mrr.status === "within_target",
    twr_meets_target: mrrVal.twr.status === "within_target",
  };

  const nextList = [...current];
  nextList[idx] = updatedRecord;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
  } catch (err) {
    console.error("Failed to persist updated actuals to localStorage", err);
  }
  return nextList;
}

export function deleteFutureExperiment(experiment_id: string): FutureExperimentRecord[] {
  const current = loadFutureExperiments().filter((item) => item.experiment_id !== experiment_id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.error("Failed to save to localStorage after delete", err);
  }
  return current;
}

export function exportFutureExperimentsCsv(): string {
  const records = loadFutureExperiments();
  const headers = [
    "Experiment_ID",
    "Timestamp",
    "Ip_A",
    "Vg_V",
    "TON_us",
    "TOFF_us",
    "Predicted_MRR_g_min",
    "Actual_MRR_g_min",
    "MRR_Error_Pct",
    "MRR_Meets_5Pct_Target",
    "Predicted_TWR_g_min",
    "Actual_TWR_g_min",
    "TWR_Error_Pct",
    "TWR_Meets_5Pct_Target",
    "Model_Version",
    "Notes",
  ];

  const rows = records.map((r) => [
    r.experiment_id,
    r.timestamp,
    r.Ip,
    r.Vg,
    r.Ton,
    r.Toff,
    r.predicted_mrr.toFixed(5),
    r.actual_mrr !== null ? r.actual_mrr.toFixed(5) : "",
    r.mrr_pct_error !== null ? r.mrr_pct_error.toFixed(2) : "",
    r.mrr_meets_target !== null ? (r.mrr_meets_target ? "YES" : "NO") : "",
    r.predicted_twr.toFixed(5),
    r.actual_twr !== null ? r.actual_twr.toFixed(5) : "",
    r.twr_pct_error !== null ? r.twr_pct_error.toFixed(2) : "",
    r.twr_meets_target !== null ? (r.twr_meets_target ? "YES" : "NO") : "",
    r.model_version,
    `"${(r.notes || "").replace(/"/g, '""')}"`,
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

export function exportFutureExperimentsJson(): string {
  return JSON.stringify(loadFutureExperiments(), null, 2);
}
