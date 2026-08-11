import type { DatasetSample, DerivedMetrics, MachineParameters, UnityTelemetry } from "../types/twin";

export interface ParsedDataset {
  fileName: string;
  headers: string[];
  rows: DatasetSample[];
}

type ParameterKey = keyof DatasetSample["parameters"];
type MetricKey = keyof DatasetSample["metrics"];
type TelemetryKey = keyof DatasetSample["telemetry"];

const parameterAliases: Record<string, ParameterKey> = {
  current: "current",
  currenta: "current",
  amperage: "current",
  voltage: "voltage",
  voltagev: "voltage",
  gapvoltage: "gapVoltage",
  gapvoltagev: "gapVoltage",
  gapv: "gapVoltage",
  pulseon: "pulseOn",
  pulseonus: "pulseOn",
  ton: "pulseOn",
  pulseoff: "pulseOff",
  pulseoffus: "pulseOff",
  toff: "pulseOff",
  gapdistance: "gapDistance",
  gapdistancemm: "gapDistance",
  gap: "gapDistance",
  servofeed: "servoFeed",
  servofeedpercent: "servoFeed",
  tooldiameter: "toolDiameter",
  tooldiametermm: "toolDiameter",
  electrodediameter: "toolDiameter",
  electrodediametermm: "toolDiameter",
  dielectricpressure: "pressure",
  dielectricpressurebar: "pressure",
  flushingpressure: "pressure",
  flushingpressurebar: "pressure",
  pressure: "pressure",
  dielectricflow: "flowRate",
  flowrate: "flowRate",
  flowratelpm: "flowRate",
  flow: "flowRate",
  dielectricconductivity: "conductivity",
  conductivity: "conductivity",
  conductivityuscm: "conductivity",
  opencircuitvoltage: "openCircuitVoltage",
  opencircuitvoltagev: "openCircuitVoltage",
  ocv: "openCircuitVoltage",
  depthofcut: "depthOfCut",
  depthofcutmm: "depthOfCut",
};

const metricAliases: Record<string, MetricKey> = {
  dutycycle: "dutyCycle",
  mrr: "mrr",
  materialremovalrate: "mrr",
  twr: "toolWearRate",
  toolwear: "toolWearRate",
  toolwearrate: "toolWearRate",
  surfaceroughness: "surfaceRoughness",
  ra: "surfaceRoughness",
  surfacera: "surfaceRoughness",
  machinehealth: "machineHealth",
  health: "machineHealth",
  gapstability: "gapStability",
  temperature: "dielectricTemperature",
  temperaturec: "dielectricTemperature",
  dielectrictemperature: "dielectricTemperature",
};

const telemetryAliases: Record<string, TelemetryKey> = {
  toolposition: "toolPosition",
  toolpositionmm: "toolPosition",
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseNumber(value: string) {
  if (value.trim() === "") return undefined;
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function coerceOriginal(value: string) {
  const numeric = parseNumber(value);
  return numeric ?? value;
}

export function parseCsvDataset(csvText: string, fileName: string): ParsedDataset {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV must include a header row and at least one data row.");

  const headers = parseCsvLine(lines[0]);
  const normalizedHeaders = headers.map(normalizeHeader);
  const rows: DatasetSample[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = parseCsvLine(lines[lineIndex]);
    if (cells.every((cell) => cell.trim() === "")) continue;

    const parameters: DatasetSample["parameters"] = {};
    const metrics: DatasetSample["metrics"] = {};
    const telemetry: DatasetSample["telemetry"] = {};
    const original: DatasetSample["original"] = {};
    let t: number | string = rows.length;

    headers.forEach((header, columnIndex) => {
      const raw = cells[columnIndex] ?? "";
      if (raw.trim() === "") return;

      const normalized = normalizedHeaders[columnIndex];
      const numeric = parseNumber(raw);
      original[header] = coerceOriginal(raw);

      if (["timestamp", "time", "sample", "samplenumber", "index", "row"].includes(normalized)) {
        t = numeric ?? raw;
        return;
      }

      const parameterKey = parameterAliases[normalized];
      if (parameterKey && numeric !== undefined) {
        parameters[parameterKey] = numeric as MachineParameters[typeof parameterKey];
        return;
      }

      const metricKey = metricAliases[normalized];
      if (metricKey && numeric !== undefined) {
        metrics[metricKey] = numeric as DerivedMetrics[typeof metricKey];
        return;
      }

      const telemetryKey = telemetryAliases[normalized];
      if (telemetryKey && numeric !== undefined) {
        telemetry[telemetryKey] = numeric as UnityTelemetry[typeof telemetryKey];
      }
    });

    if (Object.keys(original).length === 0) continue;
    rows.push({ t, parameters, metrics, telemetry, original });
  }

  if (rows.length === 0) throw new Error("CSV did not contain any usable data rows.");
  return { fileName, headers, rows };
}
