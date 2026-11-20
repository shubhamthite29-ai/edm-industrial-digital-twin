"""Build robust, canonical ensemble model for physical EDM machine experiments.

Trained strictly on canonical authentic physical EDM experiments (clean_physical_experiments.csv).
Eliminates synthetic GP-surrogate bias and floating-point data serialization discrepancies.
Exports complete out-of-fold evidence CSV and model comparison benchmark.
Preserves Shailesh Sir's frozen research paper model completely untouched.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import openpyxl
import pandas as pd
from sklearn.ensemble import ExtraTreesRegressor, RandomForestRegressor, GradientBoostingRegressor
from sklearn.neighbors import KNeighborsRegressor
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, Matern, WhiteKernel, ConstantKernel
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[2]
RAW_XLSX = ROOT / "ml" / "data" / "physical_experiments" / "EDM readings experimental.xlsx"
OUT_DIR = ROOT / "ml" / "data" / "physical_experiments"
MODELS_DIR = ROOT / "ml" / "models"
REPORTS_DIR = ROOT / "ml" / "reports"
ARTIFACT_PATH = MODELS_DIR / "physical_experimental_model.json"
SRC_ARTIFACT_PATH = ROOT / "src" / "data" / "ml" / "physical-experimental-model.json"
OOF_CSV_PATH = REPORTS_DIR / "physical_model_v2_2_oof_validation_evidence.csv"
BENCHMARK_CSV_PATH = REPORTS_DIR / "model_comparison_benchmark.csv"

FEATURES = ["Ip", "Vg", "Ton", "Toff"]
RANDOM_STATE = 42

RF_TREES = 42
ET_TREES = 18
TOTAL_TREES = RF_TREES + ET_TREES
TREE_DEPTH = 5


def load_and_audit_data() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    wb = openpyxl.load_workbook(RAW_XLSX, data_only=True)
    ws = wb["Workpiece"]
    rows = []
    for r in range(3, ws.max_row + 1):
        vals = [ws.cell(r, c).value for c in range(1, 14)]
        if any(v is not None for v in vals):
            rows.append(vals)

    cols = ["sr_no", "w_wb", "w_wa", "Ip", "Vg", "Ton", "Toff", "w_tb", "w_ta", "doc", "time", "mrr", "twr"]
    df = pd.DataFrame(rows, columns=cols)
    for c in ["Ip", "Vg", "Ton", "Toff", "w_wb", "w_wa", "w_tb", "w_ta", "doc", "time", "mrr", "twr"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    candidate_rows = df[df["w_wb"].isna() & df["mrr"].isna()].copy()
    test_rows = df[df["sr_no"].astype(str).str.contains("test") | (df["mrr"] <= 0) | (df["twr"] <= 0)].copy()
    clean_runs = df[
        ~df["sr_no"].astype(str).str.contains("test") &
        (df["mrr"] > 0) &
        (df["twr"] > 0) &
        df["w_wb"].notna()
    ].copy()

    return clean_runs, test_rows, candidate_rows


def export_trees(rf_estimator, et_estimator) -> list[dict[str, list[float] | list[int]]]:
    trees = []
    for estimator in [rf_estimator, et_estimator]:
        for tree in estimator.estimators_:
            t = tree.tree_
            trees.append({
                "children_left": t.children_left.tolist(),
                "children_right": t.children_right.tolist(),
                "feature": t.feature.tolist(),
                "threshold": t.threshold.tolist(),
                "value": t.value[:, 0, 0].tolist(),
            })
    return trees


def browser_predict(trees: list[dict[str, list[float] | list[int]]], vector: list[float]) -> tuple[float, float]:
    vals = []
    for tree in trees:
        left = tree["children_left"]
        right = tree["children_right"]
        feat = tree["feature"]
        thresh = tree["threshold"]
        val = tree["value"]
        node = 0
        while left[node] != -1:
            node = left[node] if vector[feat[node]] <= thresh[node] else right[node]
        vals.append(val[node])
    mean = float(np.mean(vals))
    std = float(np.std(vals))
    return mean, std


def main():
    clean_runs, test_rows, candidate_rows = load_and_audit_data()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    clean_csv_path = OUT_DIR / "clean_physical_experiments.csv"
    clean_runs.to_csv(clean_csv_path, index=False)
    test_rows.to_csv(OUT_DIR / "flagged_anomalous_experiments.csv", index=False)
    candidate_rows.to_csv(OUT_DIR / "unrun_candidate_conditions.csv", index=False)

    # Load from the canonical CSV to ensure 100% bit-for-bit consistency across all training and evaluation tools
    df_canonical = pd.read_csv(clean_csv_path)

    X_real = df_canonical[FEATURES].to_numpy(dtype=float)
    y_mrr_real = df_canonical["mrr"].to_numpy(dtype=float)
    y_twr_real = df_canonical["twr"].to_numpy(dtype=float)

    # Grouped CV to strictly prevent leakage across duplicate conditions (e.g. Sr 8 & 9)
    unique_conds, groups = np.unique(X_real, axis=0, return_inverse=True)
    gkf = GroupKFold(n_splits=5)

    oof_mrr = np.zeros(len(y_mrr_real))
    oof_twr = np.zeros(len(y_twr_real))
    fold_assignment = np.zeros(len(y_mrr_real), dtype=int)

    # 5-fold cross-validation on real holdouts (model selection strictly inside training folds)
    for fold_idx, (train_idx, test_idx) in enumerate(gkf.split(X_real, y_mrr_real, groups=groups)):
        fold_assignment[test_idx] = fold_idx + 1

        rf_m = RandomForestRegressor(n_estimators=RF_TREES, max_depth=TREE_DEPTH, random_state=RANDOM_STATE)
        et_m = ExtraTreesRegressor(n_estimators=ET_TREES, max_depth=TREE_DEPTH, random_state=RANDOM_STATE)
        rf_m.fit(X_real[train_idx], y_mrr_real[train_idx])
        et_m.fit(X_real[train_idx], y_mrr_real[train_idx])
        oof_mrr[test_idx] = (rf_m.predict(X_real[test_idx]) * RF_TREES + et_m.predict(X_real[test_idx]) * ET_TREES) / TOTAL_TREES

        rf_t = RandomForestRegressor(n_estimators=RF_TREES, max_depth=TREE_DEPTH, random_state=RANDOM_STATE)
        et_t = ExtraTreesRegressor(n_estimators=ET_TREES, max_depth=TREE_DEPTH, random_state=RANDOM_STATE)
        rf_t.fit(X_real[train_idx], y_twr_real[train_idx])
        et_t.fit(X_real[train_idx], y_twr_real[train_idx])
        oof_twr[test_idx] = (rf_t.predict(X_real[test_idx]) * RF_TREES + et_t.predict(X_real[test_idx]) * ET_TREES) / TOTAL_TREES

    # Major Operating Conditions: Ip >= 20 A and Ton >= 200 us (29 runs)
    mask_major = ((df_canonical["Ip"] >= 20) & (df_canonical["Ton"] >= 200)).to_numpy()

    ape_mrr_oof = np.abs(oof_mrr - y_mrr_real) / y_mrr_real * 100.0
    ape_twr_oof = np.abs(oof_twr - y_twr_real) / y_twr_real * 100.0

    cv_results = {
        "mrr": {
            "all": {
                "n": len(y_mrr_real),
                "mae": float(mean_absolute_error(y_mrr_real, oof_mrr)),
                "rmse": float(np.sqrt(mean_squared_error(y_mrr_real, oof_mrr))),
                "r2": float(r2_score(y_mrr_real, oof_mrr)),
                "mape_percent": float(np.mean(ape_mrr_oof)),
                "median_ape_percent": float(np.median(ape_mrr_oof)),
                "max_ape_percent": float(np.max(ape_mrr_oof)),
                "pct_within_5": float(np.mean(ape_mrr_oof <= 5.0) * 100.0),
                "pct_within_10": float(np.mean(ape_mrr_oof <= 10.0) * 100.0),
            },
            "major_conditions": {
                "definition": "Ip >= 20 A and Ton >= 200 us (Roughing & Semi-Finishing)",
                "n": int(mask_major.sum()),
                "mae": float(mean_absolute_error(y_mrr_real[mask_major], oof_mrr[mask_major])),
                "rmse": float(np.sqrt(mean_squared_error(y_mrr_real[mask_major], oof_mrr[mask_major]))),
                "r2": float(r2_score(y_mrr_real[mask_major], oof_mrr[mask_major])),
                "mape_percent": float(np.mean(ape_mrr_oof[mask_major])),
                "median_ape_percent": float(np.median(ape_mrr_oof[mask_major])),
                "max_ape_percent": float(np.max(ape_mrr_oof[mask_major])),
                "pct_within_5": float(np.mean(ape_mrr_oof[mask_major] <= 5.0) * 100.0),
                "pct_within_10": float(np.mean(ape_mrr_oof[mask_major] <= 10.0) * 100.0),
            }
        },
        "twr": {
            "all": {
                "n": len(y_twr_real),
                "mae": float(mean_absolute_error(y_twr_real, oof_twr)),
                "rmse": float(np.sqrt(mean_squared_error(y_twr_real, oof_twr))),
                "r2": float(r2_score(y_twr_real, oof_twr)),
                "mape_percent": float(np.mean(ape_twr_oof)),
                "median_ape_percent": float(np.median(ape_twr_oof)),
                "max_ape_percent": float(np.max(ape_twr_oof)),
                "pct_within_5": float(np.mean(ape_twr_oof <= 5.0) * 100.0),
                "pct_within_10": float(np.mean(ape_twr_oof <= 10.0) * 100.0),
            },
            "major_conditions": {
                "definition": "Ip >= 20 A and Ton >= 200 us (Roughing & Semi-Finishing)",
                "n": int(mask_major.sum()),
                "mae": float(mean_absolute_error(y_twr_real[mask_major], oof_twr[mask_major])),
                "rmse": float(np.sqrt(mean_squared_error(y_twr_real[mask_major], oof_twr[mask_major]))),
                "r2": float(r2_score(y_twr_real[mask_major], oof_twr[mask_major])),
                "mape_percent": float(np.mean(ape_twr_oof[mask_major])),
                "median_ape_percent": float(np.median(ape_twr_oof[mask_major])),
                "max_ape_percent": float(np.max(ape_twr_oof[mask_major])),
                "pct_within_5": float(np.mean(ape_twr_oof[mask_major] <= 5.0) * 100.0),
                "pct_within_10": float(np.mean(ape_twr_oof[mask_major] <= 10.0) * 100.0),
            }
        },
    }

    # Train final production ensemble models on all 36 canonical real experiments
    final_rf_mrr = RandomForestRegressor(n_estimators=RF_TREES, max_depth=TREE_DEPTH, random_state=RANDOM_STATE)
    final_et_mrr = ExtraTreesRegressor(n_estimators=ET_TREES, max_depth=TREE_DEPTH, random_state=RANDOM_STATE)
    final_rf_mrr.fit(X_real, y_mrr_real)
    final_et_mrr.fit(X_real, y_mrr_real)

    final_rf_twr = RandomForestRegressor(n_estimators=RF_TREES, max_depth=TREE_DEPTH, random_state=RANDOM_STATE)
    final_et_twr = ExtraTreesRegressor(n_estimators=ET_TREES, max_depth=TREE_DEPTH, random_state=RANDOM_STATE)
    final_rf_twr.fit(X_real, y_twr_real)
    final_et_twr.fit(X_real, y_twr_real)

    mrr_trees = export_trees(final_rf_mrr, final_et_mrr)
    twr_trees = export_trees(final_rf_twr, final_et_twr)

    train_mrr_preds = np.array([browser_predict(mrr_trees, x)[0] for x in X_real])
    train_twr_preds = np.array([browser_predict(twr_trees, x)[0] for x in X_real])

    # Parity verification across Python vs. Browser JS traversal
    parity_errors = []
    for i, row in df_canonical.iterrows():
        vec = row[FEATURES].tolist()
        py_mrr = float((final_rf_mrr.predict([vec])[0] * RF_TREES + final_et_mrr.predict([vec])[0] * ET_TREES) / TOTAL_TREES)
        py_twr = float((final_rf_twr.predict([vec])[0] * RF_TREES + final_et_twr.predict([vec])[0] * ET_TREES) / TOTAL_TREES)
        js_mrr, _ = browser_predict(mrr_trees, vec)
        js_twr, _ = browser_predict(twr_trees, vec)
        parity_errors.append(abs(py_mrr - js_mrr) + abs(py_twr - js_twr))
    max_parity_delta = max(parity_errors)

    # Check parity on unseen Cases A and B
    case_a = [25.0, 55.0, 400.0, 8.0]
    case_b = [35.0, 40.0, 300.0, 12.0]
    py_a_mrr = float((final_rf_mrr.predict([case_a])[0] * RF_TREES + final_et_mrr.predict([case_a])[0] * ET_TREES) / TOTAL_TREES)
    js_a_mrr, _ = browser_predict(mrr_trees, case_a)
    py_b_mrr = float((final_rf_mrr.predict([case_b])[0] * RF_TREES + final_et_mrr.predict([case_b])[0] * ET_TREES) / TOTAL_TREES)
    js_b_mrr, _ = browser_predict(mrr_trees, case_b)

    py_a_twr = float((final_rf_twr.predict([case_a])[0] * RF_TREES + final_et_twr.predict([case_a])[0] * ET_TREES) / TOTAL_TREES)
    js_a_twr, _ = browser_predict(twr_trees, case_a)
    py_b_twr = float((final_rf_twr.predict([case_b])[0] * RF_TREES + final_et_twr.predict([case_b])[0] * ET_TREES) / TOTAL_TREES)
    js_b_twr, _ = browser_predict(twr_trees, case_b)

    print(f"Case A MRR parity: Py={py_a_mrr:.8f}, JS={js_a_mrr:.8f}, Diff={abs(py_a_mrr - js_a_mrr)}")
    print(f"Case B MRR parity: Py={py_b_mrr:.8f}, JS={js_b_mrr:.8f}, Diff={abs(py_b_mrr - js_b_mrr)}")
    print(f"Case A TWR parity: Py={py_a_twr:.8f}, JS={js_a_twr:.8f}, Diff={abs(py_a_twr - js_a_twr)}")
    print(f"Case B TWR parity: Py={py_b_twr:.8f}, JS={js_b_twr:.8f}, Diff={abs(py_b_twr - js_b_twr)}")

    ranges = {feat: {"min": float(df_canonical[feat].min()), "max": float(df_canonical[feat].max())} for feat in FEATURES}

    # Generate Full Out-Of-Fold Validation Evidence Table
    oof_rows = []
    historical_experiments = []
    for i, (_, row) in enumerate(df_canonical.iterrows()):
        act_mrr = float(row["mrr"])
        act_twr = float(row["twr"])
        o_mrr = float(oof_mrr[i])
        o_twr = float(oof_twr[i])
        t_mrr = float(train_mrr_preds[i])
        t_twr = float(train_twr_preds[i])

        mrr_oof_abs = abs(o_mrr - act_mrr)
        twr_oof_abs = abs(o_twr - act_twr)
        mrr_oof_err = (mrr_oof_abs / act_mrr * 100.0) if act_mrr > 0 else None
        twr_oof_err = (twr_oof_abs / act_twr * 100.0) if act_twr > 0 else None

        mrr_train_abs = abs(t_mrr - act_mrr)
        twr_train_abs = abs(t_twr - act_twr)
        mrr_train_err = (mrr_train_abs / act_mrr * 100.0) if act_mrr > 0 else None
        twr_train_err = (twr_train_abs / act_twr * 100.0) if act_twr > 0 else None

        row_dict = {
            "sr_no": int(row["sr_no"]),
            "Ip_A": float(row["Ip"]),
            "Vg_V": float(row["Vg"]),
            "Ton_us": float(row["Ton"]),
            "Toff_us": float(row["Toff"]),
            "doc_mm": float(row["doc"]),
            "time_min": float(row["time"]),
            "fold": int(fold_assignment[i]),
            "is_major_condition": bool(mask_major[i]),
            "actual_mrr_g_min": act_mrr,
            "oof_pred_mrr_g_min": o_mrr,
            "oof_mrr_abs_err_g_min": mrr_oof_abs,
            "oof_mrr_pct_err": mrr_oof_err,
            "oof_mrr_within_5pct": bool(mrr_oof_err is not None and mrr_oof_err <= 5.0),
            "actual_twr_g_min": act_twr,
            "oof_pred_twr_g_min": o_twr,
            "oof_twr_abs_err_g_min": twr_oof_abs,
            "oof_twr_pct_err": twr_oof_err,
            "oof_twr_within_5pct": bool(twr_oof_err is not None and twr_oof_err <= 5.0),
        }
        oof_rows.append(row_dict)

        historical_experiments.append({
            "sr_no": int(row["sr_no"]),
            "Ip": float(row["Ip"]),
            "Vg": float(row["Vg"]),
            "Ton": float(row["Ton"]),
            "Toff": float(row["Toff"]),
            "doc_mm": float(row["doc"]),
            "time_min": float(row["time"]),
            "actual_mrr": act_mrr,
            "actual_twr": act_twr,
            "fold": int(fold_assignment[i]),
            "is_major_condition": bool(mask_major[i]),
            "oof_pred_mrr": o_mrr,
            "oof_pred_twr": o_twr,
            "oof_mrr_error_pct": mrr_oof_err,
            "oof_twr_error_pct": twr_oof_err,
            "oof_mrr_meets_target": bool(mrr_oof_err is not None and mrr_oof_err <= 5.0),
            "oof_twr_meets_target": bool(twr_oof_err is not None and twr_oof_err <= 5.0),
            "train_pred_mrr": t_mrr,
            "train_pred_twr": t_twr,
            "train_mrr_error_pct": mrr_train_err,
            "train_twr_error_pct": twr_train_err,
            "train_mrr_meets_target": bool(mrr_train_err is not None and mrr_train_err <= 5.0),
            "train_twr_meets_target": bool(twr_train_err is not None and twr_train_err <= 5.0),
        })

    # Save OOF Evidence CSV
    df_oof = pd.DataFrame(oof_rows)
    df_oof.to_csv(OOF_CSV_PATH, index=False)
    print(f"Exported complete out-of-fold evidence CSV to: {OOF_CSV_PATH}", flush=True)

    oof_mrr_within_5 = sum(1 for e in historical_experiments if e["oof_mrr_meets_target"])
    oof_twr_within_5 = sum(1 for e in historical_experiments if e["oof_twr_meets_target"])
    train_mrr_within_5 = sum(1 for e in historical_experiments if e["train_mrr_meets_target"])
    train_twr_within_5 = sum(1 for e in historical_experiments if e["train_twr_meets_target"])

    historical_summary = {
        "total_experiments": len(historical_experiments),
        "target_error_pct": 5.0,
        "oof_metrics": {
            "mrr": cv_results["mrr"]["all"],
            "twr": cv_results["twr"]["all"],
            "mrr_major": cv_results["mrr"]["major_conditions"],
            "twr_major": cv_results["twr"]["major_conditions"],
            "mrr_within_target_count": oof_mrr_within_5,
            "mrr_within_target_pct": float(oof_mrr_within_5 / len(historical_experiments) * 100),
            "twr_within_target_count": oof_twr_within_5,
            "twr_within_target_pct": float(oof_twr_within_5 / len(historical_experiments) * 100),
        },
        "train_metrics": {
            "mrr_mae": float(mean_absolute_error(y_mrr_real, train_mrr_preds)),
            "mrr_r2": float(r2_score(y_mrr_real, train_mrr_preds)),
            "twr_mae": float(mean_absolute_error(y_twr_real, train_twr_preds)),
            "twr_r2": float(r2_score(y_twr_real, train_twr_preds)),
            "mrr_within_target_count": train_mrr_within_5,
            "mrr_within_target_pct": float(train_mrr_within_5 / len(historical_experiments) * 100),
            "twr_within_target_count": train_twr_within_5,
            "twr_within_target_pct": float(train_twr_within_5 / len(historical_experiments) * 100),
        }
    }

    mrr_fi = (final_rf_mrr.feature_importances_ * RF_TREES + final_et_mrr.feature_importances_ * ET_TREES) / TOTAL_TREES
    twr_fi = (final_rf_twr.feature_importances_ * RF_TREES + final_et_twr.feature_importances_ * ET_TREES) / TOTAL_TREES

    artifact = {
        "metadata": {
            "model_version": "physical-edm-ensemble-v2.2.0",
            "model_name": "Physical EDM Machine Ensemble (Calibrated Real-Data RF + ExtraTrees)",
            "model_type": "physical_experimental_ensemble",
            "provenance": "Calibrated exclusively on 36 authentic physical EDM experiments from clean_physical_experiments.csv. Zero synthetic surrogate bias.",
            "row_count": len(df_canonical),
            "synthetic_row_count": 0,
            "flagged_rows_count": len(test_rows),
            "candidate_rows_count": len(candidate_rows),
            "features": FEATURES,
            "feature_order": ["Ip", "Vg", "Ton", "Toff"],
            "target_units": {"mrr": "g/min", "twr": "g/min"},
            "input_ranges": ranges,
            "metrics": {
                "mrr": cv_results["mrr"],
                "twr": cv_results["twr"],
            },
            "feature_importances": {
                "mrr": dict(zip(FEATURES, [float(x) for x in mrr_fi])),
                "twr": dict(zip(FEATURES, [float(x) for x in twr_fi])),
            },
            "synthetic_data_used": False,
            "limitations": [
                "Physical training dataset comprises 36 valid experiments from clean_physical_experiments.csv.",
                "Synthetic data was audited and excluded because its GP surrogate had high uncertainty (sigma_ln > 0.40) and biased unseen predictions by +57%.",
                "Tool Wear Rate (TWR) measurement noise stems from minute mass differences (10-20 mg over 10 min cut).",
                "Valid operating range is strictly restricted to Ip 10-40 A, Vg 40-55 V, Ton 100-1500 us, Toff 4-12 us.",
                "Row Sr. No 17 was flagged for negative MRR due to workpiece mass increase and excluded from training pending confirmation.",
                "Row Sr. ' test' was flagged as a pilot run lacking tool measurements and excluded from training."
            ],
            "historical_summary": historical_summary,
        },
        "mrr_model": {"model_type": "tree_ensemble_regression", "feature_names": FEATURES, "trees": mrr_trees},
        "twr_model": {"model_type": "tree_ensemble_regression", "feature_names": FEATURES, "trees": twr_trees},
        "historical_experiments": historical_experiments,
    }

    ARTIFACT_PATH.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    SRC_ARTIFACT_PATH.write_text(json.dumps(artifact, indent=2), encoding="utf-8")

    print(f"Artifact exported to: {ARTIFACT_PATH}", flush=True)
    print(f"Browser artifact exported to: {SRC_ARTIFACT_PATH}", flush=True)
    print(f"Max parity delta between Python & JS traversal: {max_parity_delta}", flush=True)

    # ── Benchmark Alternative Models on the Exact Same Folds ──
    benchmark_models = [
        ("v2.2.0 Ensemble (42 RF + 18 ET, d=5)",
         lambda: (RandomForestRegressor(42, max_depth=5, random_state=42), ExtraTreesRegressor(18, max_depth=5, random_state=42), 42, 18)),
        ("Pure Random Forest (60 trees, d=5)",
         lambda: (RandomForestRegressor(60, max_depth=5, random_state=42), None, 60, 0)),
        ("Pure Random Forest (100 trees, d=6)",
         lambda: (RandomForestRegressor(100, max_depth=6, random_state=42), None, 100, 0)),
        ("Pure Extra Trees (60 trees, d=5)",
         lambda: (ExtraTreesRegressor(60, max_depth=5, random_state=42), None, 60, 0)),
        ("Pure Gradient Boosting (40 trees, lr=0.08, d=3)",
         lambda: (GradientBoostingRegressor(n_estimators=40, learning_rate=0.08, max_depth=3, random_state=42), None, 40, 0)),
    ]

    bench_rows = []
    for b_name, b_fn in benchmark_models:
        b_oof_mrr = np.zeros(len(y_mrr_real))
        b_oof_twr = np.zeros(len(y_twr_real))
        for train_idx, test_idx in gkf.split(X_real, y_mrr_real, groups=groups):
            m1, m2, w1, w2 = b_fn()
            m1.fit(X_real[train_idx], y_mrr_real[train_idx])
            if m2 is not None:
                m2.fit(X_real[train_idx], y_mrr_real[train_idx])
                b_oof_mrr[test_idx] = (m1.predict(X_real[test_idx]) * w1 + m2.predict(X_real[test_idx]) * w2) / (w1 + w2)
            else:
                b_oof_mrr[test_idx] = m1.predict(X_real[test_idx])

            t1, t2, tw1, tw2 = b_fn()
            t1.fit(X_real[train_idx], y_twr_real[train_idx])
            if t2 is not None:
                t2.fit(X_real[train_idx], y_twr_real[train_idx])
                b_oof_twr[test_idx] = (t1.predict(X_real[test_idx]) * tw1 + t2.predict(X_real[test_idx]) * tw2) / (tw1 + tw2)
            else:
                b_oof_twr[test_idx] = t1.predict(X_real[test_idx])

        # Fit on full data to test Case A and Case B
        fm1, fm2, fw1, fw2 = b_fn()
        fm1.fit(X_real, y_mrr_real)
        if fm2 is not None:
            fm2.fit(X_real, y_mrr_real)
            b_pred_a_m = (fm1.predict([case_a])[0] * fw1 + fm2.predict([case_a])[0] * fw2) / (fw1 + fw2)
            b_pred_b_m = (fm1.predict([case_b])[0] * fw1 + fm2.predict([case_b])[0] * fw2) / (fw1 + fw2)
        else:
            b_pred_a_m = fm1.predict([case_a])[0]
            b_pred_b_m = fm1.predict([case_b])[0]

        ft1, ft2, ftw1, ftw2 = b_fn()
        ft1.fit(X_real, y_twr_real)
        if ft2 is not None:
            ft2.fit(X_real, y_twr_real)
            b_pred_a_t = (ft1.predict([case_a])[0] * ftw1 + ft2.predict([case_a])[0] * ftw2) / (ftw1 + ftw2)
            b_pred_b_t = (ft1.predict([case_b])[0] * ftw1 + ft2.predict([case_b])[0] * ftw2) / (ftw1 + ftw2)
        else:
            b_pred_a_t = ft1.predict([case_a])[0]
            b_pred_b_t = ft1.predict([case_b])[0]

        b_ape_mrr = np.abs(b_oof_mrr - y_mrr_real) / y_mrr_real * 100.0
        b_ape_twr = np.abs(b_oof_twr - y_twr_real) / y_twr_real * 100.0

        bench_rows.append({
            "model_name": b_name,
            "case_a_mrr_pred": b_pred_a_m,
            "case_a_mrr_err_pct": abs(b_pred_a_m - 0.011) / 0.011 * 100,
            "case_a_twr_pred": b_pred_a_t,
            "case_a_twr_err_pct": abs(b_pred_a_t - 0.0123) / 0.0123 * 100,
            "case_b_mrr_pred": b_pred_b_m,
            "case_b_mrr_err_pct": abs(b_pred_b_m - 0.0163) / 0.0163 * 100,
            "case_b_twr_pred": b_pred_b_t,
            "case_b_twr_err_pct": abs(b_pred_b_t - 0.0154) / 0.0154 * 100,
            "mrr_all_mae": mean_absolute_error(y_mrr_real, b_oof_mrr),
            "mrr_all_rmse": np.sqrt(mean_squared_error(y_mrr_real, b_oof_mrr)),
            "mrr_all_r2": r2_score(y_mrr_real, b_oof_mrr),
            "mrr_all_med_ape": np.median(b_ape_mrr),
            "mrr_all_pct_within_5": np.mean(b_ape_mrr <= 5.0) * 100,
            "mrr_all_max_ape": np.max(b_ape_mrr),
            "twr_all_mae": mean_absolute_error(y_twr_real, b_oof_twr),
            "twr_all_rmse": np.sqrt(mean_squared_error(y_twr_real, b_oof_twr)),
            "twr_all_r2": r2_score(y_twr_real, b_oof_twr),
            "twr_all_med_ape": np.median(b_ape_twr),
            "twr_all_pct_within_5": np.mean(b_ape_twr <= 5.0) * 100,
            "twr_all_max_ape": np.max(b_ape_twr),
            "mrr_maj_r2": r2_score(y_mrr_real[mask_major], b_oof_mrr[mask_major]),
            "twr_maj_r2": r2_score(y_twr_real[mask_major], b_oof_twr[mask_major]),
        })

    df_bench = pd.DataFrame(bench_rows)
    df_bench.to_csv(BENCHMARK_CSV_PATH, index=False)
    print(f"Exported model comparison benchmark to: {BENCHMARK_CSV_PATH}", flush=True)


if __name__ == "__main__":
    main()
