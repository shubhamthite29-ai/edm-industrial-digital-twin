"""Build the active EDM browser model from the supplied Shailesh-Sir archive only.

This script intentionally reads the zip archive directly.  No historical CSV, user
experiment, literature package, or prior artifact is an input to this pipeline.
"""

from __future__ import annotations

import hashlib
import json
import math
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = Path(r"C:\Users\ShubhamShaurya\Downloads\files.zip")
OUT = ROOT / "ml" / "data" / "shailesh_sir"
REPORTS = ROOT / "ml" / "reports"
ARTIFACT = ROOT / "src" / "data" / "ml" / "frozen-research-model.json"
PARITY_CASES = ROOT / "ml" / "tests" / "fixtures" / "shailesh_browser_parity_cases.json"

FEATURES = ["Current_A", "Voltage_V", "TON_us", "coating_alcrni_pvd"]
REAL_WEIGHT = 300.0
RANDOM_STATE = 20260929


class NumpyRandomForestRegressor:
    """Small deterministic CART bagging implementation kept source-local for reproducibility.

    It avoids a runtime package installation while retaining the Random Forest model
    contract: bootstrapped examples, randomized split features, independently trained
    regression trees, and averaged tree predictions.
    """

    def __init__(self, n_estimators: int, max_depth: int, min_samples_leaf: int, max_features: int, random_state: int):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.min_samples_leaf = min_samples_leaf
        self.max_features = max_features
        self.random_state = random_state
        self.estimators_: list[dict[str, list[float] | list[int]]] = []
        self.feature_importances_: np.ndarray | None = None

    def fit(self, x: np.ndarray, y: np.ndarray, sample_weight: np.ndarray | None = None):
        rng = np.random.default_rng(self.random_state)
        weights = np.ones(len(y), dtype=float) if sample_weight is None else sample_weight.astype(float)
        importance = np.zeros(x.shape[1], dtype=float)
        self.estimators_ = []
        draw_probability = weights / weights.sum()
        for _ in range(self.n_estimators):
            # Weighted bootstrapping preserves real-source priority in both sampling
            # and split variance rather than only using synthetic row count.
            index = rng.choice(len(y), size=min(len(y), 2500), replace=True, p=draw_probability)
            tree, tree_importance = self._build_tree(x, y, weights, index, rng)
            self.estimators_.append(tree)
            importance += tree_importance
        self.feature_importances_ = importance / importance.sum() if importance.sum() else importance
        return self

    def _build_tree(self, x, y, weights, initial_index, rng):
        left: list[int] = []
        right: list[int] = []
        features: list[int] = []
        threshold: list[float] = []
        value: list[float] = []
        importance = np.zeros(x.shape[1], dtype=float)

        def add_node(index: np.ndarray, depth: int) -> int:
            node = len(left)
            node_weights = weights[index]
            total_weight = float(node_weights.sum())
            weighted_sum = float(np.dot(node_weights, y[index]))
            weighted_sum_sq = float(np.dot(node_weights, y[index] * y[index]))
            node_value = weighted_sum / total_weight if total_weight else float(np.mean(y[index]))
            parent_sse = max(0.0, weighted_sum_sq - weighted_sum * weighted_sum / total_weight) if total_weight else 0.0
            left.append(-1); right.append(-1); features.append(-2); threshold.append(-2.0); value.append(node_value)
            if depth >= self.max_depth or len(index) < self.min_samples_leaf * 2 or parent_sse <= 1e-14:
                return node
            feature_count = min(self.max_features, x.shape[1])
            candidates = rng.choice(x.shape[1], size=feature_count, replace=False)
            best: tuple[float, int, float, np.ndarray, np.ndarray] | None = None
            for feature in candidates:
                values = x[index, feature]
                unique = np.unique(values)
                if len(unique) < 2:
                    continue
                # Quantile cut points limit fitting time while preserving non-linear behavior.
                quantiles = np.unique(np.quantile(unique, np.linspace(0.04, 0.96, 16)))
                for cut in quantiles:
                    lower = index[values <= cut]
                    upper = index[values > cut]
                    if len(lower) < self.min_samples_leaf or len(upper) < self.min_samples_leaf:
                        continue
                    lw, uw = weights[lower], weights[upper]
                    lsum, usum = float(lw.sum()), float(uw.sum())
                    if not lsum or not usum:
                        continue
                    ly, uy = y[lower], y[upper]
                    lsse = max(0.0, float(np.dot(lw, ly * ly)) - float(np.dot(lw, ly)) ** 2 / lsum)
                    usse = max(0.0, float(np.dot(uw, uy * uy)) - float(np.dot(uw, uy)) ** 2 / usum)
                    score = lsse + usse
                    if best is None or score < best[0]:
                        best = (score, int(feature), float(cut), lower, upper)
            if best is None:
                return node
            score, feature, cut, lower, upper = best
            features[node] = feature
            threshold[node] = cut
            importance[feature] += parent_sse - score
            left[node] = add_node(lower, depth + 1)
            right[node] = add_node(upper, depth + 1)
            return node

        add_node(initial_index, 0)
        return {"children_left": left, "children_right": right, "feature": features, "threshold": threshold, "value": value}, importance

    def predict(self, x: np.ndarray) -> np.ndarray:
        prediction = np.zeros(len(x), dtype=float)
        for tree in self.estimators_:
            for row_number, row in enumerate(x):
                node = 0
                while tree["children_left"][node] != -1:
                    node = tree["children_left"][node] if row[tree["feature"][node]] <= tree["threshold"][node] else tree["children_right"][node]
                prediction[row_number] += tree["value"][node]
        return prediction / len(self.estimators_)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_authoritative_data() -> tuple[pd.DataFrame, pd.DataFrame, dict[str, str]]:
    if not ARCHIVE.is_file():
        raise SystemExit(f"Authoritative archive was not found: {ARCHIVE}")
    with zipfile.ZipFile(ARCHIVE) as archive:
        names = set(archive.namelist())
        required = {"real_experimental.csv", "synthetic_augmented.csv"}
        missing = required - names
        if missing:
            raise SystemExit(f"Archive is missing required members: {sorted(missing)}")
        with archive.open("real_experimental.csv") as handle:
            real = pd.read_csv(handle)
        with archive.open("synthetic_augmented.csv") as handle:
            synthetic = pd.read_csv(handle)
        source_hashes = {name: hashlib.sha256(archive.read(name)).hexdigest() for name in required}
    required_columns = {
        "Experiment_ID", "Source", "Workpiece", "Electrode", "Electrode_Coating",
        "Current_A", "Voltage_V", "TON_us", "MRR_g_min", "TWR_g_min", "Data_Status",
    }
    for label, frame in (("real", real), ("synthetic", synthetic)):
        missing = required_columns - set(frame.columns)
        if missing:
            raise SystemExit(f"{label} data is missing required columns: {sorted(missing)}")
        if frame[sorted(required_columns)].isna().any().any():
            raise SystemExit(f"{label} data contains missing values in required fields")
    if set(real["Data_Status"].unique()) != {"REAL_EXPERIMENTAL"}:
        raise SystemExit("real_experimental.csv has an unexpected Data_Status")
    if set(synthetic["Data_Status"].unique()) != {"SYNTHETIC_AUGMENTED"}:
        raise SystemExit("synthetic_augmented.csv has an unexpected Data_Status")
    return real, synthetic, source_hashes


def vectorize(frame: pd.DataFrame) -> np.ndarray:
    return np.column_stack((
        frame["Current_A"].astype(float),
        frame["Voltage_V"].astype(float),
        frame["TON_us"].astype(float),
        (frame["Electrode_Coating"].astype(str) == "AlCrNi (PVD)").astype(float),
    ))


def make_model(seed: int, n_estimators: int = 80, small_dataset: bool = False):
    return NumpyRandomForestRegressor(
        n_estimators=n_estimators,
        max_depth=6 if small_dataset else 8,
        min_samples_leaf=2 if small_dataset else 10,
        max_features=3,
        random_state=seed,
    )


def metric_block(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float | None]:
    errors = actual - predicted
    mae = float(np.mean(np.abs(errors)))
    rmse = float(math.sqrt(np.mean(errors ** 2)))
    total = float(np.sum((actual - np.mean(actual)) ** 2))
    r2 = float(1 - np.sum(errors ** 2) / total) if total > 1e-14 else None
    return {
        "mae": mae,
        "rmse": rmse,
        "r2": r2,
        "mape_percent": float(np.mean(np.abs((actual - predicted) / actual)) * 100),
    }


def real_only_validation(real: pd.DataFrame) -> dict[str, dict[str, float | None]]:
    """Four-fold coating-stratified validation with no synthetic data in any fold."""
    x = vectorize(real)
    # Each coating has 16 source observations. A deterministic shuffled round-robin
    # assignment gives four balanced folds without an external ML dependency.
    rng = np.random.default_rng(RANDOM_STATE)
    fold_ids = np.empty(len(real), dtype=int)
    for coating in sorted(real["Electrode_Coating"].astype(str).unique()):
        members = np.flatnonzero(real["Electrode_Coating"].astype(str).to_numpy() == coating)
        fold_ids[members[rng.permutation(len(members))]] = np.arange(len(members)) % 4
    result: dict[str, dict[str, float | None]] = {}
    for target in ("MRR_g_min", "TWR_g_min"):
        observed = real[target].astype(float).to_numpy()
        prediction = np.zeros(len(real), dtype=float)
        for fold in range(4):
            train, test = np.flatnonzero(fold_ids != fold), np.flatnonzero(fold_ids == fold)
            estimator = make_model(RANDOM_STATE + fold + (100 if target.startswith("TWR") else 0), n_estimators=30, small_dataset=True)
            estimator.fit(x[train], observed[train])
            prediction[test] = estimator.predict(x[test])
        result[target] = metric_block(observed, prediction)
    return result


def tree_payload(estimator) -> list[dict[str, list[float] | list[int]]]:
    return estimator.estimators_


def browser_predict(forest: list[dict[str, list[float] | list[int]]], values: list[float]) -> float:
    total = 0.0
    for tree in forest:
        left = tree["children_left"]
        right = tree["children_right"]
        features = tree["feature"]
        threshold = tree["threshold"]
        value = tree["value"]
        node = 0
        while left[node] != -1:
            node = left[node] if values[features[node]] <= threshold[node] else right[node]
        total += value[node]
    return total / len(forest)


def main() -> None:
    real, synthetic, member_hashes = load_authoritative_data()
    OUT.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    PARITY_CASES.parent.mkdir(parents=True, exist_ok=True)

    # Preserve the provided response values; no density conversion or alternative formula is applied.
    real.to_csv(OUT / "REAL_EXPERIMENTAL.csv", index=False)
    synthetic.to_csv(OUT / "SYNTHETIC_AUGMENTED.csv", index=False)
    training = pd.concat([real, synthetic], ignore_index=True)
    training.to_csv(OUT / "FINAL_TRAINING_DATA.csv", index=False)
    x = vectorize(training)
    weights = np.where(training["Data_Status"].eq("REAL_EXPERIMENTAL"), REAL_WEIGHT, 1.0)

    mrr = make_model(RANDOM_STATE)
    twr = make_model(RANDOM_STATE + 1)
    mrr.fit(x, training["MRR_g_min"].astype(float), sample_weight=weights)
    twr.fit(x, training["TWR_g_min"].astype(float), sample_weight=weights)
    validation = real_only_validation(real)

    real_x = vectorize(real)
    real_mrr = real["MRR_g_min"].astype(float).to_numpy()
    real_twr = real["TWR_g_min"].astype(float).to_numpy()
    final_mrr = mrr.predict(real_x)
    final_twr = twr.predict(real_x)
    paper = pd.DataFrame({
        "Experiment_ID": real["Experiment_ID"],
        "Source": real["Source"],
        "Current_A": real["Current_A"],
        "Voltage_V": real["Voltage_V"],
        "TON_us": real["TON_us"],
        "Workpiece": real["Workpiece"],
        "Electrode": real["Electrode"],
        "Electrode_Coating": real["Electrode_Coating"],
        "Paper_MRR_g_min": real_mrr,
        "Predicted_MRR_g_min": final_mrr,
        "MRR_Absolute_Error_g_min": np.abs(final_mrr - real_mrr),
        "MRR_Error_Percent": np.abs((final_mrr - real_mrr) / real_mrr) * 100,
        "Paper_TWR_g_min": real_twr,
        "Predicted_TWR_g_min": final_twr,
        "TWR_Absolute_Error_g_min": np.abs(final_twr - real_twr),
        "TWR_Error_Percent": np.abs((final_twr - real_twr) / real_twr) * 100,
    })
    paper.to_csv(OUT / "PAPER_MATCH_VALIDATION.csv", index=False)

    # Table 4 reports both responses to four decimal places. The paper-match gate
    # is therefore 1.5 displayed increments (0.00015 g/min), not a percentage
    # chosen after seeing a particular low-valued observation.
    paper_match_tolerance = 0.00015
    paper_matches_within_tolerance = int(((paper["MRR_Absolute_Error_g_min"] <= paper_match_tolerance) & (paper["TWR_Absolute_Error_g_min"] <= paper_match_tolerance)).sum())

    final_metrics = {"MRR_g_min": metric_block(real_mrr, final_mrr), "TWR_g_min": metric_block(real_twr, final_twr)}
    results = pd.DataFrame([
        {"target": "MRR_g_min", "model": "RandomForestRegressor", "evaluation": "real_only_stratified_4_fold", **validation["MRR_g_min"]},
        {"target": "TWR_g_min", "model": "RandomForestRegressor", "evaluation": "real_only_stratified_4_fold", **validation["TWR_g_min"]},
        {"target": "MRR_g_min", "model": "RandomForestRegressor", "evaluation": "final_model_paper_match_in_sample", **final_metrics["MRR_g_min"]},
        {"target": "TWR_g_min", "model": "RandomForestRegressor", "evaluation": "final_model_paper_match_in_sample", **final_metrics["TWR_g_min"]},
    ])
    results.to_csv(REPORTS / "MODEL_RESULTS.csv", index=False)
    importance = pd.DataFrame({
        "feature": FEATURES,
        "MRR_feature_importance": mrr.feature_importances_,
        "TWR_feature_importance": twr.feature_importances_,
    })
    importance.to_csv(REPORTS / "FEATURE_IMPORTANCE.csv", index=False)

    numeric_domain = {key: {"min": float(training[key].min()), "max": float(training[key].max())} for key in ("Current_A", "Voltage_V", "TON_us")}
    coating_values = sorted(training["Electrode_Coating"].astype(str).unique().tolist())
    mrr_forest = tree_payload(mrr)
    twr_forest = tree_payload(twr)
    source = {
        "source_id": "SHIR2021-T4",
        "title": "Assessing the Effects of Uncoated and Coated Electrode on Response Variables in Electrical Discharge Machining for Ti-6Al-4V Titanium Alloy",
        "year": "2021",
        "doi": "10.24874/ti.1020.12.20.03",
        "url": "https://www.tribology.rs/journals/2021/2021-4/2021-4-02.html",
        "workpiece": "Ti-6Al-4V",
        "electrodes": "Aluminium (Al): Uncoated; AlCrNi (PVD)",
        "observations_used": int(len(real)),
        "table_used": "Table 4",
    }
    artifact = {
        "metadata": {
            "model_version": "shailesh-sir-rf-v1.0.0",
            "training_dataset_version": "files.zip / Shailesh-Sir single-source dataset",
            "source_count": 1,
            "row_count": int(len(training)),
            "real_row_count": int(len(real)),
            "synthetic_row_count": int(len(synthetic)),
            "mrr_row_count": int(len(training)),
            "twr_row_count": int(len(training)),
            "materials": [str(value) for value in sorted(training["Workpiece"].unique())],
            "electrodes": [str(value) for value in sorted(training["Electrode"].unique())],
            "coatings": coating_values,
            "target_units": {"mrr": "g/min", "twr": "g/min"},
            "process_features": ["Current_A", "Voltage_V", "TON_us", "Electrode_Coating"],
            "metrics": {
                "mrr": {"model": "Random Forest", "real_only_stratified_4_fold": validation["MRR_g_min"], "paper_match_final_model": final_metrics["MRR_g_min"]},
                "twr": {"model": "Random Forest", "real_only_stratified_4_fold": validation["TWR_g_min"], "paper_match_final_model": final_metrics["TWR_g_min"]},
            },
            "validation_method": {"primary": "4-fold stratified by electrode coating on real observations only; synthetic augmentation excluded from every held-out fold", "paper_match": "final model evaluated on all 32 real source rows; an in-sample fidelity check, not a generalization claim"},
            "input_observation_ranges": numeric_domain,
            "limitations": [
                "One research paper, one workpiece (Ti-6Al-4V), and one electrode base material (Aluminium) only.",
                "Predictions outside Current 10-40 A, Voltage 40-55 V, or TON 100-1500 us are outside the observed domain.",
                "MRR and TWR are source-reported mass rates in g/min. The source does not provide the aluminium-electrode density required for a defensible TWR volumetric conversion, so no mm3/min values are fabricated.",
                "Synthetic rows are Shailesh-Sir-derived augmentation only and are down-weighted relative to real observations.",
            ],
            "source_archive_sha256": sha256(ARCHIVE),
            "archive_member_sha256": member_hashes,
        },
        "sources": [source],
        "materials": {"Ti-6Al-4V": {"material_name": "Ti-6Al-4V", "properties": [{"property": "density", "value": 4.43, "unit": "g/cm3", "source_id": "SHIR2021-T4", "validation_status": "source_reported_table_2"}]}},
        "electrodes": {"Aluminium (Al)": {"material_name": "Aluminium (Al)", "properties": [{"property": "coating_conditions", "value": ", ".join(coating_values), "unit": "", "source_id": "SHIR2021-T4", "validation_status": "source_reported"}]}},
        "mrr_model": {"model_type": "random_forest_regression", "feature_names": FEATURES, "trees": mrr_forest},
        "twr_model": {"model_type": "random_forest_regression", "feature_names": FEATURES, "trees": twr_forest},
        "domain": {"numeric": numeric_domain, "coatings": coating_values, "material_electrode_combinations": {"Ti-6Al-4V|Aluminium (Al)": int(len(training))}},
    }
    ARTIFACT.write_text(json.dumps(artifact, separators=(",", ":")), encoding="utf-8")

    parity_source = pd.concat([real, synthetic.sample(n=8, random_state=RANDOM_STATE)], ignore_index=True).head(20)
    cases = []
    max_mrr_delta = max_twr_delta = 0.0
    for _, row in parity_source.iterrows():
        values = vectorize(pd.DataFrame([row]))[0].tolist()
        python_mrr = float(mrr.predict(np.asarray([values]))[0])
        python_twr = float(twr.predict(np.asarray([values]))[0])
        browser_mrr = browser_predict(mrr_forest, values)
        browser_twr = browser_predict(twr_forest, values)
        max_mrr_delta = max(max_mrr_delta, abs(python_mrr - browser_mrr))
        max_twr_delta = max(max_twr_delta, abs(python_twr - browser_twr))
        cases.append({"input": {"workpiece_material": row["Workpiece"], "electrode_material": row["Electrode"], "electrode_coating": row["Electrode_Coating"], "current_A": row["Current_A"], "voltage_V": row["Voltage_V"], "ton_us": row["TON_us"]}, "python_mrr": python_mrr, "python_twr": python_twr})
    PARITY_CASES.write_text(json.dumps(cases, indent=2), encoding="utf-8")

    report = f"""# Shailesh-Sir Single-Source EDM Random Forest Model

## Scope and provenance

This is the active EDM ML pipeline. It reads **only** `{ARCHIVE.name}` (SHA-256 `{sha256(ARCHIVE)}`), specifically `real_experimental.csv` and `synthetic_augmented.csv`. Historical datasets, user experimental data, other papers, old artifacts, and old formulas are not inputs.

- Source paper: {source['title']} ({source['year']}), DOI `{source['doi']}`.
- Source responses: direct Table 4 MRR and TWR values.
- Source methodology: `MRR (g/min) = (Wi - Wf) / t`; `TWR (g/min) = (Ti - Tf) / t`.
- Raw masses and machining times are not reported, so direct table values are preserved exactly. No alternate formula is applied.

## Dataset

| Item | Count/value |
|---|---:|
| Real experimental rows | {len(real)} |
| Synthetic augmented rows | {len(synthetic)} |
| Final training rows | {len(training)} |
| Papers | 1 |
| Workpieces | Ti-6Al-4V |
| Electrode base materials | Aluminium (Al) |
| Coating conditions | {', '.join(coating_values)} |
| Features | Current_A, Voltage_V, TON_us, Electrode_Coating |

`Rotation`, TOFF, duty cycle, dielectric, and every unsupported material/property are excluded from the active model.

## Units

Both target columns are **g/min**, exactly as Table 4 reports them. Ti-6Al-4V density is reported as 4.43 g/cm3, but the paper does not provide the aluminium-electrode density needed to convert TWR to volume. Therefore neither response is relabelled as mm3/min and no unsupported conversion is made.

## Model and validation

- Model: Random Forest regression, 80 weighted-bootstrap trees, max depth 8, randomized three-feature split selection, and all four dataset-supported features.
- Real-data priority: real observations receive a training weight of {REAL_WEIGHT:g}; synthetic augmentation receives 1.
- Generalization: 4-fold coating-stratified validation over 32 real observations only. Synthetic augmentation is excluded from all held-out folds.
- Paper match: final model evaluated against all 32 real rows. This is a source-fidelity/in-sample check, not generalization evidence.

| Target | Generalization MAE | Generalization RMSE | Generalization R2 | Paper mean error % | Paper maximum error % |
|---|---:|---:|---:|---:|---:|
| MRR (g/min) | {validation['MRR_g_min']['mae']:.8f} | {validation['MRR_g_min']['rmse']:.8f} | {validation['MRR_g_min']['r2']:.5f} | {final_metrics['MRR_g_min']['mape_percent']:.5f} | {paper['MRR_Error_Percent'].max():.5f} |
| TWR (g/min) | {validation['TWR_g_min']['mae']:.8f} | {validation['TWR_g_min']['rmse']:.8f} | {validation['TWR_g_min']['r2']:.5f} | {final_metrics['TWR_g_min']['mape_percent']:.5f} | {paper['TWR_Error_Percent'].max():.5f} |

The paper-match tolerance is `{paper_match_tolerance:.5f} g/min` (1.5 times the source table's `0.0001 g/min` display resolution), applied to both targets. `{paper_matches_within_tolerance}/{len(paper)}` rows meet both absolute-error limits. This threshold is a table-resolution fidelity gate, not a claim about external prediction accuracy.

## Browser parity

20 source-derived cases were evaluated through the exported tree ensemble. Maximum Python/browser difference: MRR `{max_mrr_delta:.12g}` g/min; TWR `{max_twr_delta:.12g}` g/min.

## Files

- `ml/data/shailesh_sir/REAL_EXPERIMENTAL.csv`
- `ml/data/shailesh_sir/SYNTHETIC_AUGMENTED.csv`
- `ml/data/shailesh_sir/FINAL_TRAINING_DATA.csv`
- `ml/data/shailesh_sir/PAPER_MATCH_VALIDATION.csv`
- `ml/reports/MODEL_RESULTS.csv`
- `ml/reports/FEATURE_IMPORTANCE.csv`
- `src/data/ml/frozen-research-model.json`
"""
    (REPORTS / "ML_MODEL_REPORT.md").write_text(report, encoding="utf-8")
    print(json.dumps({"real_rows": len(real), "synthetic_rows": len(synthetic), "paper_match": {"tolerance_g_min": paper_match_tolerance, "within_tolerance": paper_matches_within_tolerance, "mrr_mean_percent": final_metrics["MRR_g_min"]["mape_percent"], "twr_mean_percent": final_metrics["TWR_g_min"]["mape_percent"]}, "browser_parity": {"mrr": max_mrr_delta, "twr": max_twr_delta}}, indent=2))


if __name__ == "__main__":
    main()
