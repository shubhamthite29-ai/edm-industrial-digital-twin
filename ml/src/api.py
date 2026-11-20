from __future__ import annotations

from typing import Any

from .ml_engine import MODELS_DIR, optimize, predict, property_table, model_info, source_summary

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
except ModuleNotFoundError as exc:  # pragma: no cover - exercised only before requirements installation
    raise RuntimeError("FastAPI runtime is not installed. Run: pip install -r ml/requirements.txt") from exc


class PredictionInput(BaseModel):
    workpiece_material: str
    electrode_material: str
    current_A: float
    voltage_V: float
    ton_us: float
    toff_us: float | None = None
    duty_cycle: float | None = None
    gap_um: float | None = None
    electrode_rotation_rpm: float | None = None
    flushing_pressure: float | None = None
    polarity: str | None = ""
    dielectric: str | None = ""
    workpiece_density_g_cm3: float | None = None
    workpiece_hardness: float | None = None
    workpiece_melting_point_C: float | None = None
    workpiece_thermal_conductivity_W_mK: float | None = None
    workpiece_specific_heat_J_kgK: float | None = None
    workpiece_electrical_resistivity_ohm_m: float | None = None
    workpiece_tensile_strength_MPa: float | None = None
    workpiece_yield_strength_MPa: float | None = None
    workpiece_toughness_MPa_sqrt_m: float | None = None
    electrode_density_g_cm3: float | None = None
    electrode_hardness: float | None = None
    electrode_melting_point_C: float | None = None
    electrode_thermal_conductivity_W_mK: float | None = None
    electrode_specific_heat_J_kgK: float | None = None
    electrode_electrical_resistivity_ohm_m: float | None = None
    electrode_tensile_strength_MPa: float | None = None
    electrode_toughness_MPa_sqrt_m: float | None = None


class OptimizeInput(PredictionInput):
    current_min: float = Field(default=5)
    current_max: float = Field(default=30)
    voltage_min: float = Field(default=40)
    voltage_max: float = Field(default=120)
    ton_min: float = Field(default=10)
    ton_max: float = Field(default=500)
    toff_min: float = Field(default=5)
    toff_max: float = Field(default=200)
    mrr_weight: float = Field(default=0.7)
    twr_weight: float = Field(default=0.3)


class ValidateRow(PredictionInput):
    experimental_mrr: float | None = None
    experimental_twr: float | None = None


app = FastAPI(title="EDM Research ML API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def as_row(payload: PredictionInput) -> dict[str, Any]:
    return {
        "workpiece_material": payload.workpiece_material,
        "electrode_material": payload.electrode_material,
        "current_A": payload.current_A,
        "voltage_V": payload.voltage_V,
        "ton_us": payload.ton_us,
        "toff_us": payload.toff_us,
        "duty_cycle": payload.duty_cycle,
        "gap_um": payload.gap_um,
        "electrode_rotation_rpm": payload.electrode_rotation_rpm,
        "flushing_pressure": payload.flushing_pressure,
        "polarity": payload.polarity or "",
        "dielectric": payload.dielectric or "",
        "workpiece_density_g_cm3": payload.workpiece_density_g_cm3,
        "workpiece_hardness": payload.workpiece_hardness,
        "workpiece_melting_point_C": payload.workpiece_melting_point_C,
        "workpiece_thermal_conductivity_W_mK": payload.workpiece_thermal_conductivity_W_mK,
        "workpiece_specific_heat_J_kgK": payload.workpiece_specific_heat_J_kgK,
        "workpiece_electrical_resistivity_ohm_m": payload.workpiece_electrical_resistivity_ohm_m,
        "workpiece_tensile_strength_MPa": payload.workpiece_tensile_strength_MPa,
        "workpiece_yield_strength_MPa": payload.workpiece_yield_strength_MPa,
        "workpiece_toughness_MPa_sqrt_m": payload.workpiece_toughness_MPa_sqrt_m,
        "electrode_density_g_cm3": payload.electrode_density_g_cm3,
        "electrode_hardness": payload.electrode_hardness,
        "electrode_melting_point_C": payload.electrode_melting_point_C,
        "electrode_thermal_conductivity_W_mK": payload.electrode_thermal_conductivity_W_mK,
        "electrode_specific_heat_J_kgK": payload.electrode_specific_heat_J_kgK,
        "electrode_electrical_resistivity_ohm_m": payload.electrode_electrical_resistivity_ohm_m,
        "electrode_tensile_strength_MPa": payload.electrode_tensile_strength_MPa,
        "electrode_toughness_MPa_sqrt_m": payload.electrode_toughness_MPa_sqrt_m,
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "edm-ml-api", "runtime": "fastapi", "model_dir": str(MODELS_DIR)}


@app.get("/materials")
def materials() -> dict[str, Any]:
    return {"materials": property_table(MODELS_DIR.parent / "data" / "processed" / "materials.csv")}


@app.get("/electrodes")
def electrodes() -> dict[str, Any]:
    return {"electrodes": property_table(MODELS_DIR.parent / "data" / "processed" / "electrodes.csv")}


@app.get("/model-info")
def info() -> dict[str, Any]:
    return model_info()


@app.get("/sources")
def sources() -> dict[str, Any]:
    return {"sources": source_summary()}


@app.post("/predict")
def predict_endpoint(payload: PredictionInput) -> dict[str, Any]:
    return predict(as_row(payload))


@app.post("/optimize")
def optimize_endpoint(payload: OptimizeInput) -> dict[str, Any]:
    if payload.current_min > payload.current_max or payload.voltage_min > payload.voltage_max or payload.ton_min > payload.ton_max or payload.toff_min > payload.toff_max:
        raise HTTPException(status_code=400, detail="Optimization min values must be <= max values.")
    return optimize(
        as_row(payload),
        {
            "current_A": (payload.current_min, payload.current_max),
            "voltage_V": (payload.voltage_min, payload.voltage_max),
            "ton_us": (payload.ton_min, payload.ton_max),
            "toff_us": (payload.toff_min, payload.toff_max),
        },
        {"mrr": payload.mrr_weight, "twr": payload.twr_weight},
    )


@app.post("/validate")
def validate_endpoint(rows: list[ValidateRow]) -> dict[str, Any]:
    predictions = []
    mrr_errors = []
    twr_errors = []
    experimental_mrr_values = []
    predicted_mrr_values = []
    experimental_twr_values = []
    predicted_twr_values = []
    for index, payload in enumerate(rows, start=1):
        pred = predict(as_row(payload))
        record: dict[str, Any] = {"sample": index, **pred}
        if payload.experimental_mrr not in (None, 0):
            error = abs(payload.experimental_mrr - pred["predicted_mrr"]) / abs(payload.experimental_mrr) * 100
            record["experimental_mrr"] = payload.experimental_mrr
            record["mrr_error_percent"] = error
            mrr_errors.append(error)
            experimental_mrr_values.append(payload.experimental_mrr)
            predicted_mrr_values.append(pred["predicted_mrr"])
        if payload.experimental_twr not in (None, 0):
            error = abs(payload.experimental_twr - pred["predicted_twr"]) / abs(payload.experimental_twr) * 100
            record["experimental_twr"] = payload.experimental_twr
            record["twr_error_percent"] = error
            twr_errors.append(error)
            experimental_twr_values.append(payload.experimental_twr)
            predicted_twr_values.append(pred["predicted_twr"])
        predictions.append(record)
    def regression_metrics(actual: list[float], predicted: list[float]) -> dict[str, float | None]:
        if not actual:
            return {"mae": None, "rmse": None, "mape": None, "r2": None}
        errors = [a - p for a, p in zip(actual, predicted)]
        mae = sum(abs(error) for error in errors) / len(errors)
        rmse = (sum(error * error for error in errors) / len(errors)) ** 0.5
        mape = sum(abs(error) / abs(actual[index]) * 100 for index, error in enumerate(errors) if actual[index] != 0) / len(errors)
        mean_actual = sum(actual) / len(actual)
        ss_tot = sum((value - mean_actual) ** 2 for value in actual)
        ss_res = sum(error * error for error in errors)
        r2 = 1 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0
        return {"mae": mae, "rmse": rmse, "mape": mape, "r2": r2}
    return {
        "training_data": "Published research only",
        "testing_data": "User independent experimental dataset",
        "rows": predictions,
        "mrr": regression_metrics(experimental_mrr_values, predicted_mrr_values),
        "twr": regression_metrics(experimental_twr_values, predicted_twr_values),
        "mrr_mape": sum(mrr_errors) / len(mrr_errors) if mrr_errors else None,
        "twr_mape": sum(twr_errors) / len(twr_errors) if twr_errors else None,
    }
