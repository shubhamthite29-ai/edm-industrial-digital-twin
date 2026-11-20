import artifact from "../data/ml/frozen-research-model.json";

export interface MlPropertyRow { property: string; value: string | number; unit: string; source_id: string; validation_status: string; [key: string]: string | number; }
export interface MlMaterialTableEntry { material_name: string; properties: MlPropertyRow[]; }
export interface MlSourceInfo { source_id: string; title: string; year: string; doi: string; url: string; workpiece: string; electrodes: string; observations_used: number; table_used: string; }
type Metrics = { mae: number | null; rmse: number | null; mape: number | null; r2: number | null };
type Bounds = { min: number; max: number };
export interface MlModelInfo {
  model_version: string; training_dataset_version: string; source_count: number; row_count: number; real_row_count?: number; synthetic_row_count?: number; mrr_row_count: number; twr_row_count: number;
  materials: string[]; electrodes: string[]; coatings?: string[]; target_units: { mrr: string; twr: string }; limitations: string[]; process_features?: string[];
  metrics: { mrr: { model?: string; grouped_by_source?: Metrics }; twr: { model?: string; grouped_by_source?: Metrics } }; selected_models?: { mrr?: { model_type?: string }; twr?: { model_type?: string } }; validation_method?: { primary?: string }; input_observation_ranges?: Record<string, Bounds>; sources?: MlSourceInfo[];
}
export interface MlPredictionInput { workpiece_material: string; electrode_material: string; electrode_coating?: string; current_A: number; voltage_V: number; ton_us: number; experimental_mrr?: number; experimental_twr?: number; }
export interface MlPredictionResult { predicted_mrr: number | null; predicted_twr: number | null; mrr_unit: string; twr_unit: string; model_version: string; domain_status: "in_domain" | "limited" | "out_of_domain"; warnings: string[]; coverage: { combination: string; mrr_supported: boolean; twr_supported: boolean }; }
export interface MlOptimizationResult { recommended_current_A: number | null; recommended_voltage_V: number | null; recommended_ton_us: number | null; predicted_mrr: number | null; predicted_twr: number | null; optimization_score: number; domain_status: "in_domain" | "limited" | "out_of_domain"; warnings: string[]; }
export interface MlValidationRow extends MlPredictionInput { experimental_mrr?: number; experimental_twr?: number; }
export interface MlValidationResult { training_data: string; testing_data: string; rows: Array<MlPredictionResult & { sample: number; experimental_mrr?: number; experimental_twr?: number; mrr_error_percent?: number; twr_error_percent?: number }>; mrr: Metrics; twr: Metrics; mrr_mape: number | null; twr_mape: number | null; }

type Tree = { children_left: number[]; children_right: number[]; feature: number[]; threshold: number[]; value: number[] };
type Forest = { model_type: "random_forest_regression"; feature_names: string[]; trees: Tree[] };
type RawArtifact = { metadata: Omit<MlModelInfo, "metrics" | "selected_models"> & { metrics: { mrr: { model?: string; real_only_stratified_4_fold?: Metrics }; twr: { model?: string; real_only_stratified_4_fold?: Metrics } } }; sources: MlSourceInfo[]; materials: Record<string, MlMaterialTableEntry>; electrodes: Record<string, MlMaterialTableEntry>; mrr_model: Forest; twr_model: Forest; domain: { numeric: Record<string, Bounds>; coatings: string[]; material_electrode_combinations: Record<string, number> }; };
const model = artifact as unknown as RawArtifact;

function information(): MlModelInfo {
  return { ...model.metadata, metrics: { mrr: { model: model.metadata.metrics.mrr.model, grouped_by_source: model.metadata.metrics.mrr.real_only_stratified_4_fold as unknown as Metrics }, twr: { model: model.metadata.metrics.twr.model, grouped_by_source: model.metadata.metrics.twr.real_only_stratified_4_fold as unknown as Metrics } }, selected_models: { mrr: { model_type: "Random Forest" }, twr: { model_type: "Random Forest" } } };
}
function values(input: MlPredictionInput) { return [input.current_A, input.voltage_V, input.ton_us, input.electrode_coating === "AlCrNi (PVD)" ? 1 : 0]; }
function estimate(forest: Forest, input: MlPredictionInput) { const vector = values(input); return forest.trees.reduce((sum, tree) => { let node = 0; while (tree.children_left[node] !== -1) node = vector[tree.feature[node]] <= tree.threshold[node] ? tree.children_left[node] : tree.children_right[node]; return sum + tree.value[node]; }, 0) / forest.trees.length; }
function combination(input: MlPredictionInput) { return `${input.workpiece_material}|${input.electrode_material}`; }
function warnings(input: MlPredictionInput) {
  const result: string[] = [], combo = combination(input);
  if (!(combo in model.domain.material_electrode_combinations)) result.push("This workpiece/electrode pair is not represented by the Shailesh-Sir training data.");
  const payloadKeyByArtifactKey = { Current_A: "current_A", Voltage_V: "voltage_V", TON_us: "ton_us" } as const;
  for (const [name, range] of Object.entries(model.domain.numeric)) {
    const key = payloadKeyByArtifactKey[name as keyof typeof payloadKeyByArtifactKey];
    const value = key ? input[key] : undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) result.push(`${name} must be a finite number.`);
    else if (value < range.min || value > range.max) result.push(`${name}=${value} is outside the observed range [${range.min}, ${range.max}].`);
  }
  if (!model.domain.coatings.includes(input.electrode_coating ?? "")) result.push(`Electrode coating ${input.electrode_coating || "(blank)"} is not represented by the Shailesh-Sir training data.`);
  return result;
}
function predict(input: MlPredictionInput): MlPredictionResult {
  const inputWarnings = warnings(input), supported = inputWarnings.every((message) => !message.includes("not represented")) && combination(input) in model.domain.material_electrode_combinations, inRange = !inputWarnings.some((message) => message.includes("outside") || message.includes("finite"));
  return { predicted_mrr: supported ? Math.max(0, estimate(model.mrr_model, input)) : null, predicted_twr: supported ? Math.max(0, estimate(model.twr_model, input)) : null, mrr_unit: model.metadata.target_units.mrr, twr_unit: model.metadata.target_units.twr, model_version: model.metadata.model_version, domain_status: !supported ? "out_of_domain" : inRange ? "in_domain" : "limited", warnings: inputWarnings, coverage: { combination: combination(input), mrr_supported: supported, twr_supported: supported } };
}
function metric(actual: number[], predicted: number[]): Metrics { if (!actual.length) return { mae: null, rmse: null, mape: null, r2: null }; const errors = actual.map((value, index) => value - predicted[index]), mean = actual.reduce((sum, value) => sum + value, 0) / actual.length, total = actual.reduce((sum, value) => sum + (value - mean) ** 2, 0); return { mae: errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length, rmse: Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length), mape: errors.reduce((sum, value, index) => sum + (actual[index] ? Math.abs(value / actual[index]) * 100 : 0), 0) / errors.length, r2: total ? 1 - errors.reduce((sum, value) => sum + value ** 2, 0) / total : null }; }
function grid(range: Bounds, steps = 7) { return Array.from({ length: steps }, (_, index) => range.min + (range.max - range.min) * index / (steps - 1)); }

export async function getMlHealth() { return { status: "ok" as const, service: "shailesh-sir-edm-random-forest", runtime: "browser-static-artifact", model_dir: "bundled" }; }
export async function getMlModelInfo() { return information(); }
export async function getMlSources() { return model.sources; }
export async function getMlMaterials() { return model.materials; }
export async function getMlElectrodes() { return model.electrodes; }
export function getMlInputRanges() { return { current_A: model.domain.numeric.Current_A, voltage_V: model.domain.numeric.Voltage_V, ton_us: model.domain.numeric.TON_us }; }
export async function predictMl(payload: MlPredictionInput) { return predict(payload); }
export async function optimizeMl(payload: MlPredictionInput & { mrr_weight: number; twr_weight: number }): Promise<MlOptimizationResult> {
  const candidates: Array<{ input: MlPredictionInput; prediction: MlPredictionResult }> = [];
  for (const current_A of grid(model.domain.numeric.Current_A)) for (const voltage_V of grid(model.domain.numeric.Voltage_V)) for (const ton_us of grid(model.domain.numeric.TON_us)) { const input = { ...payload, current_A, voltage_V, ton_us }, prediction = predict(input); if (prediction.domain_status === "in_domain" && prediction.predicted_mrr !== null && prediction.predicted_twr !== null) candidates.push({ input, prediction }); }
  if (!candidates.length) return { recommended_current_A: null, recommended_voltage_V: null, recommended_ton_us: null, predicted_mrr: null, predicted_twr: null, optimization_score: 0, domain_status: "out_of_domain", warnings: ["No valid Shailesh-Sir-domain candidates are available for this selection."] };
  const mrrValues = candidates.map(({ prediction }) => prediction.predicted_mrr as number), twrValues = candidates.map(({ prediction }) => prediction.predicted_twr as number), normalize = (value: number, items: number[], inverse = false) => { const low = Math.min(...items), high = Math.max(...items), score = high === low ? 0.5 : (value - low) / (high - low); return inverse ? 1 - score : score; };
  const best = candidates.map((candidate) => ({ ...candidate, score: payload.mrr_weight * normalize(candidate.prediction.predicted_mrr as number, mrrValues) + payload.twr_weight * normalize(candidate.prediction.predicted_twr as number, twrValues, true) })).sort((left, right) => right.score - left.score)[0];
  return { recommended_current_A: best.input.current_A, recommended_voltage_V: best.input.voltage_V, recommended_ton_us: best.input.ton_us, predicted_mrr: best.prediction.predicted_mrr, predicted_twr: best.prediction.predicted_twr, optimization_score: best.score, domain_status: "in_domain", warnings: best.prediction.warnings };
}
export async function validateMl(rows: MlValidationRow[]): Promise<MlValidationResult> {
  const actualMrr: number[] = [], actualTwr: number[] = [], predictedMrr: number[] = [], predictedTwr: number[] = [];
  const output = rows.map((row, index) => { const result = predict(row), item: MlValidationResult["rows"][number] = { ...result, sample: index + 1, experimental_mrr: row.experimental_mrr, experimental_twr: row.experimental_twr }; if (row.experimental_mrr !== undefined && result.predicted_mrr !== null) { actualMrr.push(row.experimental_mrr); predictedMrr.push(result.predicted_mrr); item.mrr_error_percent = Math.abs((row.experimental_mrr - result.predicted_mrr) / row.experimental_mrr) * 100; } if (row.experimental_twr !== undefined && result.predicted_twr !== null) { actualTwr.push(row.experimental_twr); predictedTwr.push(result.predicted_twr); item.twr_error_percent = Math.abs((row.experimental_twr - result.predicted_twr) / row.experimental_twr) * 100; } return item; });
  const mrr = metric(actualMrr, predictedMrr), twr = metric(actualTwr, predictedTwr);
  return { training_data: "Shailesh-Sir source archive only; user experimental data is never training input.", testing_data: "Selected CSV evaluated against the frozen browser model only.", rows: output, mrr, twr, mrr_mape: mrr.mape, twr_mape: twr.mape };
}
export function mlBackendBaseUrl() { return "Bundled Shailesh-Sir Random Forest"; }
