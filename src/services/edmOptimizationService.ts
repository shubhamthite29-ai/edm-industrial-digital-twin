import type { DatasetSample } from "../types/twin";

export type OptimizationObjective = "balanced" | "max-mrr" | "min-twr" | "best-surface";

export interface OptimizationMetricAvailability {
  mrr: boolean;
  twr: boolean;
  surfaceRoughness: boolean;
}

export interface RankedExperimentalCondition {
  sample: DatasetSample;
  rowIndex: number;
  score: number;
  objectiveValue: number | null;
}

export interface OptimizationResult {
  objective: OptimizationObjective;
  availableMetrics: OptimizationMetricAvailability;
  validSampleCount: number;
  excludedSampleCount: number;
  rankedSamples: RankedExperimentalCondition[];
  bestCondition: RankedExperimentalCondition | null;
  message: string;
  explanation: string;
}

export const optimizationObjectives: Array<{ id: OptimizationObjective; label: string }> = [
  { id: "balanced", label: "Balanced Performance" },
  { id: "max-mrr", label: "Maximum MRR" },
  { id: "min-twr", label: "Minimum Tool Wear" },
  { id: "best-surface", label: "Best Surface Finish" },
];

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function metricRange(values: number[]) {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function normalized(value: number, min: number, max: number, invert = false) {
  if (max === min) return 0.5;
  const score = (value - min) / (max - min);
  return invert ? 1 - score : score;
}

function getObjectiveValue(sample: DatasetSample, objective: OptimizationObjective) {
  if (objective === "max-mrr") return finiteNumber(sample.metrics.mrr) ? sample.metrics.mrr : null;
  if (objective === "min-twr") return finiteNumber(sample.metrics.toolWearRate) ? sample.metrics.toolWearRate : null;
  if (objective === "best-surface") return finiteNumber(sample.metrics.surfaceRoughness) ? sample.metrics.surfaceRoughness : null;
  return null;
}

function missingObjectiveMessage(objective: OptimizationObjective) {
  if (objective === "max-mrr") return "MRR is not available in the uploaded dataset.";
  if (objective === "min-twr") return "Tool Wear Rate is not available in the uploaded dataset.";
  if (objective === "best-surface") return "Surface Roughness is not available in the uploaded dataset.";
  return "MRR, Tool Wear Rate, and Surface Roughness are not available in the uploaded dataset.";
}

function objectiveExplanation(objective: OptimizationObjective, validCount: number, availableMetrics: OptimizationMetricAvailability) {
  if (objective === "max-mrr") return "This experimental condition achieved the highest measured material removal rate in the uploaded dataset.";
  if (objective === "min-twr") return "This condition recorded the lowest tool wear rate among the valid experimental observations.";
  if (objective === "best-surface") return "This condition produced the lowest measured surface roughness in the uploaded dataset.";

  const basis = [
    availableMetrics.mrr ? "MRR" : null,
    availableMetrics.twr ? "TWR" : null,
    availableMetrics.surfaceRoughness ? "Surface Roughness" : null,
  ].filter(Boolean);
  return `This condition provides the strongest observed trade-off across ${basis.join(", ")} among ${validCount.toLocaleString()} valid experimental samples.`;
}

export function analyzeDatasetOptimization(rows: DatasetSample[], objective: OptimizationObjective): OptimizationResult {
  const availableMetrics: OptimizationMetricAvailability = {
    mrr: rows.some((row) => finiteNumber(row.metrics.mrr)),
    twr: rows.some((row) => finiteNumber(row.metrics.toolWearRate)),
    surfaceRoughness: rows.some((row) => finiteNumber(row.metrics.surfaceRoughness)),
  };

  if (rows.length === 0) {
    return {
      objective,
      availableMetrics,
      validSampleCount: 0,
      excludedSampleCount: 0,
      rankedSamples: [],
      bestCondition: null,
      message: "Upload an experimental dataset to identify optimal observed machining conditions.",
      explanation: "Status: WAITING FOR DATASET",
    };
  }

  if (objective !== "balanced") {
    const values = rows
      .map((sample, rowIndex) => ({ sample, rowIndex, value: getObjectiveValue(sample, objective) }))
      .filter((entry): entry is { sample: DatasetSample; rowIndex: number; value: number } => finiteNumber(entry.value));

    if (values.length === 0) {
      return {
        objective,
        availableMetrics,
        validSampleCount: 0,
        excludedSampleCount: rows.length,
        rankedSamples: [],
        bestCondition: null,
        message: missingObjectiveMessage(objective),
        explanation: missingObjectiveMessage(objective),
      };
    }

    const { min, max } = metricRange(values.map((entry) => entry.value));
    const invert = objective !== "max-mrr";
    const rankedSamples = values
      .map((entry) => ({
        sample: entry.sample,
        rowIndex: entry.rowIndex,
        objectiveValue: entry.value,
        score: normalized(entry.value, min, max, invert) * 100,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      objective,
      availableMetrics,
      validSampleCount: rankedSamples.length,
      excludedSampleCount: rows.length - rankedSamples.length,
      rankedSamples,
      bestCondition: rankedSamples[0] ?? null,
      message: "Optimal observed condition identified from uploaded experimental data.",
      explanation: objectiveExplanation(objective, rankedSamples.length, availableMetrics),
    };
  }

  const balancedMetrics = [
    availableMetrics.mrr ? "mrr" : null,
    availableMetrics.twr ? "twr" : null,
    availableMetrics.surfaceRoughness ? "surfaceRoughness" : null,
  ].filter(Boolean) as Array<"mrr" | "twr" | "surfaceRoughness">;

  if (balancedMetrics.length === 0) {
    return {
      objective,
      availableMetrics,
      validSampleCount: 0,
      excludedSampleCount: rows.length,
      rankedSamples: [],
      bestCondition: null,
      message: missingObjectiveMessage(objective),
      explanation: "Balanced optimization requires at least one measured objective: MRR, TWR, or Surface Roughness.",
    };
  }

  const validRows = rows.filter((sample) =>
    balancedMetrics.every((metric) =>
      metric === "mrr" ? finiteNumber(sample.metrics.mrr) : metric === "twr" ? finiteNumber(sample.metrics.toolWearRate) : finiteNumber(sample.metrics.surfaceRoughness),
    ),
  );
  const ranges = {
    mrr: availableMetrics.mrr ? metricRange(validRows.map((row) => row.metrics.mrr).filter(finiteNumber)) : null,
    twr: availableMetrics.twr ? metricRange(validRows.map((row) => row.metrics.toolWearRate).filter(finiteNumber)) : null,
    surfaceRoughness: availableMetrics.surfaceRoughness ? metricRange(validRows.map((row) => row.metrics.surfaceRoughness).filter(finiteNumber)) : null,
  };

  const rankedSamples: RankedExperimentalCondition[] = rows
    .map((sample, rowIndex): RankedExperimentalCondition | null => {
      if (!validRows.includes(sample)) return null;
      const scores: number[] = [];

      for (const metric of balancedMetrics) {
        if (metric === "mrr" && ranges.mrr && finiteNumber(sample.metrics.mrr)) {
          scores.push(normalized(sample.metrics.mrr, ranges.mrr.min, ranges.mrr.max));
          continue;
        }
        if (metric === "twr" && ranges.twr && finiteNumber(sample.metrics.toolWearRate)) {
          scores.push(normalized(sample.metrics.toolWearRate, ranges.twr.min, ranges.twr.max, true));
          continue;
        }
        if (metric === "surfaceRoughness" && ranges.surfaceRoughness && finiteNumber(sample.metrics.surfaceRoughness)) {
          scores.push(normalized(sample.metrics.surfaceRoughness, ranges.surfaceRoughness.min, ranges.surfaceRoughness.max, true));
          continue;
        }
      }

      if (scores.length !== balancedMetrics.length) return null;
      const score = (scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100;
      return {
        sample,
        rowIndex,
        score,
        objectiveValue: score,
      };
    })
    .filter((entry): entry is RankedExperimentalCondition => entry != null)
    .sort((a, b) => b.score - a.score);

  return {
    objective,
    availableMetrics,
    validSampleCount: rankedSamples.length,
    excludedSampleCount: rows.length - rankedSamples.length,
    rankedSamples,
    bestCondition: rankedSamples[0] ?? null,
    message:
      balancedMetrics.length === 3
        ? "Balanced optimization based on MRR, TWR, and Surface Roughness."
        : `Balanced optimization based on ${balancedMetrics.map((metric) => (metric === "mrr" ? "MRR" : metric === "twr" ? "TWR" : "Surface Roughness")).join(" and ")}. Missing objectives were not invented.`,
    explanation: objectiveExplanation(objective, rankedSamples.length, availableMetrics),
  };
}
