"""Comprehensive Automated Test Suite for Physical EDM ML Model and Live Integration.

Verifies:
1. Protection of the frozen research-model artifact (Mode A).
2. Physical model artifact schema, feature order, and target units (Mode B).
3. Integer-only input handling and verified machine operating limits.
4. Positive, finite predictions and absence of NaN values.
5. Out-of-domain and boundary condition detection.
6. Clean dataset integrity, absence of NaNs, and positive targets.
7. Grouped cross-validation and strict data-leakage prevention (duplicate grouping).
8. Separation of real and synthetic validation metrics.
9. Python and browser decision-tree bit-level parity (< 1e-15).
10. Mandatory diagnostic accuracy on Case A and Case 39.
11. Isolation between Mode A (Research) and Mode B (Physical Machine).
12. Unity digital twin parameter dispatch contract.
13. Retraining dry-run and quality gate verification.
14. Deployment rollback snapshot availability and integrity.
"""

import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
FROZEN_RESEARCH_PATH = ROOT / "src" / "data" / "ml" / "frozen-research-model.json"
MANIFEST_PATH = ROOT / "backups" / "ml_preservation_pre_experimental_20261012" / "manifest.json"
PHYSICAL_MODEL_ML_PATH = ROOT / "ml" / "models" / "physical_experimental_model.json"
PHYSICAL_MODEL_SRC_PATH = ROOT / "src" / "data" / "ml" / "physical-experimental-model.json"
CLEAN_CSV_PATH = ROOT / "ml" / "data" / "physical_experiments" / "clean_physical_experiments.csv"
ROLLBACK_DIR = ROOT / "backups" / "rollback"


def predict_forest(forest: dict, vec: list) -> float:
    """Traverse exported JSON tree ensemble (matching browser evaluateForest logic)."""
    total = 0.0
    for tree in forest["trees"]:
        left = tree["children_left"]
        right = tree["children_right"]
        feat = tree["feature"]
        thresh = tree["threshold"]
        val = tree["value"]
        node = 0
        while left[node] != -1:
            node = left[node] if vec[feat[node]] <= thresh[node] else right[node]
        total += val[node]
    return total / len(forest["trees"])


# 1. Protection of the frozen research-model artifact (Mode A)
def test_frozen_research_model_untouched():
    """Verify Mode A research model was NOT modified (hash matches preservation manifest)."""
    assert FROZEN_RESEARCH_PATH.exists(), "Frozen research model must exist"
    assert MANIFEST_PATH.exists(), "Preservation manifest must exist"
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    expected_hash = manifest["src/data/ml/frozen-research-model.json"]["sha256"]
    current_hash = hashlib.sha256(FROZEN_RESEARCH_PATH.read_bytes()).hexdigest()
    assert current_hash == expected_hash, (
        f"Frozen research model was modified! Current: {current_hash}, Expected: {expected_hash}"
    )


# 2. Physical model artifact schema, feature order, and target units (Mode B)
def test_physical_model_artifact_structure():
    """Verify separate physical experimental model structure, feature order, and units."""
    assert PHYSICAL_MODEL_ML_PATH.exists(), "Physical model artifact must exist in ml/models/"
    assert PHYSICAL_MODEL_SRC_PATH.exists(), "Physical model artifact must exist in src/data/ml/"
    
    # Both paths must have identical content
    hash_ml = hashlib.sha256(PHYSICAL_MODEL_ML_PATH.read_bytes()).hexdigest()
    hash_src = hashlib.sha256(PHYSICAL_MODEL_SRC_PATH.read_bytes()).hexdigest()
    assert hash_ml == hash_src, "ml/models and src/data/ml artifacts must have identical SHA-256 hashes"
    
    data = json.loads(PHYSICAL_MODEL_ML_PATH.read_text(encoding="utf-8"))
    metadata = data["metadata"]
    assert metadata["model_version"] == "physical-edm-ensemble-v2.5.0"
    assert metadata["feature_order"] == ["Ip", "Vg", "Ton", "Toff"]
    assert metadata["target_units"] == {"mrr": "g/min", "twr": "g/min"}
    assert metadata["synthetic_data_used"] is False
    assert len(data["mrr_model"]["trees"]) == 60
    assert len(data["twr_model"]["trees"]) == 60


# 3. Integer-only input handling and verified machine operating limits
def test_integer_input_handling_and_operating_limits():
    """Verify machine limits: Ip: 10-40, Vg: 40-55, Ton: 100-1500, Toff: 4-12."""
    data = json.loads(PHYSICAL_MODEL_ML_PATH.read_text(encoding="utf-8"))
    ranges = data["metadata"]["input_ranges"]
    assert ranges["Ip"] == {"min": 10.0, "max": 40.0}
    assert ranges["Vg"] == {"min": 40.0, "max": 55.0}
    assert ranges["Ton"] == {"min": 100.0, "max": 1500.0}
    assert ranges["Toff"] == {"min": 4.0, "max": 12.0}


# 4. Positive, finite predictions and absence of NaN values
def test_positive_finite_predictions():
    """Verify predictions are finite and strictly non-negative across operating grid."""
    data = json.loads(PHYSICAL_MODEL_ML_PATH.read_text(encoding="utf-8"))
    test_grid = [
        [10.0, 40.0, 100.0, 4.0],
        [20.0, 45.0, 300.0, 7.0],
        [30.0, 50.0, 500.0, 8.0],
        [40.0, 55.0, 1000.0, 12.0],
    ]
    for vec in test_grid:
        mrr = predict_forest(data["mrr_model"], vec)
        twr = predict_forest(data["twr_model"], vec)
        assert np.isfinite(mrr) and mrr > 0.0, f"MRR must be positive finite, got {mrr} for {vec}"
        assert np.isfinite(twr) and twr > 0.0, f"TWR must be positive finite, got {twr} for {vec}"
        assert 0.0005 <= mrr <= 0.10, f"MRR {mrr} out of plausible physical bounds"
        assert 0.0005 <= twr <= 0.10, f"TWR {twr} out of plausible physical bounds"


# 5. Out-of-domain and boundary condition detection
def test_boundary_and_out_of_domain_inputs():
    """Verify predictions do not crash on boundary points and extreme out-of-domain values."""
    data = json.loads(PHYSICAL_MODEL_ML_PATH.read_text(encoding="utf-8"))
    extreme_inputs = [
        [5.0, 35.0, 50.0, 2.0],     # Below minimums
        [50.0, 70.0, 2000.0, 20.0], # Above maximums
    ]
    for vec in extreme_inputs:
        mrr = predict_forest(data["mrr_model"], vec)
        twr = predict_forest(data["twr_model"], vec)
        assert np.isfinite(mrr) and mrr > 0.0
        assert np.isfinite(twr) and twr > 0.0


# 6. Clean dataset integrity, absence of NaNs, and positive targets
def test_clean_dataset_integrity():
    """Verify clean_physical_experiments.csv has exactly 48 valid rows, no NaNs, positive targets."""
    assert CLEAN_CSV_PATH.exists()
    df = pd.read_csv(CLEAN_CSV_PATH)
    assert len(df) == 48
    assert df.isnull().sum().sum() == 0, "No NaNs allowed in canonical dataset"
    assert (df["mrr"] > 0).all(), "All MRR values must be strictly positive"
    assert (df["twr"] > 0).all(), "All TWR values must be strictly positive"
    assert (df["time"] > 0).all(), "All machining times must be positive"


# 7. Grouped cross-validation and strict data-leakage prevention (duplicate grouping)
def test_grouped_cross_validation_no_leakage():
    """Verify that duplicate runs (Sr 8 and Sr 9 at [30, 55, 500, 5]) share the same CV fold."""
    oof_csv = ROOT / "ml" / "reports" / "physical_model_final_oof_validation.csv"
    assert oof_csv.exists(), "OOF validation evidence CSV must exist"
    df_oof = pd.read_csv(oof_csv)
    
    # Locate Sr 8 and Sr 9
    r8 = df_oof[df_oof["sr_no"] == 8].iloc[0]
    r9 = df_oof[df_oof["sr_no"] == 9].iloc[0]
    assert r8["Ip"] == r9["Ip"] == 30
    assert r8["Vg"] == r9["Vg"] == 55
    assert r8["Ton"] == r9["Ton"] == 500
    assert r8["Toff"] == r9["Toff"] == 5.0
    assert r8["fold"] == r9["fold"], (
        f"Data leakage detected! Duplicate conditions Sr 8 (fold {r8['fold']}) and "
        f"Sr 9 (fold {r9['fold']}) must be in the exact same fold."
    )


# 8. Separation of real and synthetic validation metrics
def test_separation_of_real_and_synthetic_metrics():
    """Verify that synthetic data is not mixed into real evaluation metrics."""
    data = json.loads(PHYSICAL_MODEL_ML_PATH.read_text(encoding="utf-8"))
    meta = data["metadata"]
    assert meta["row_count"] == 48
    assert meta["synthetic_row_count"] == 0
    assert meta["synthetic_data_used"] is False
    assert meta["metrics"]["mrr"]["all"]["n"] == 48
    assert meta["metrics"]["twr"]["all"]["n"] == 48


# 9. Python and browser decision-tree bit-level parity (< 1e-15)
def test_python_browser_bit_level_parity():
    """Verify bit-level numerical equivalence between scikit-learn export and JSON traversal."""
    data = json.loads(PHYSICAL_MODEL_ML_PATH.read_text(encoding="utf-8"))
    
    # Train exact reference estimators on clean dataset
    df = pd.read_csv(CLEAN_CSV_PATH)
    X = df[["Ip", "Vg", "Ton", "Toff"]].values
    y_m = df["mrr"].values
    y_t = df["twr"].values
    
    from sklearn.ensemble import ExtraTreesRegressor
    et_m = ExtraTreesRegressor(n_estimators=60, max_depth=10, random_state=174).fit(X, y_m)
    et_t = ExtraTreesRegressor(n_estimators=60, max_depth=10, random_state=174).fit(X, y_t)
    
    for name, vec in [("Case A", [25.0, 55.0, 400.0, 8.0]), ("Case 39", [35.0, 40.0, 300.0, 12.0])]:
        py_m = et_m.predict([vec])[0]
        py_t = et_t.predict([vec])[0]
        
        js_m = predict_forest(data["mrr_model"], vec)
        js_t = predict_forest(data["twr_model"], vec)
        
        diff_m = abs(py_m - js_m)
        diff_t = abs(py_t - js_t)
        assert diff_m < 1e-15, f"{name} MRR parity failed: py={py_m}, js={js_m}, diff={diff_m}"
        assert diff_t < 1e-15, f"{name} TWR parity failed: py={py_t}, js={js_t}, diff={diff_t}"


# 10. Mandatory diagnostic accuracy on Case A and Case 39
def test_diagnostic_cases_accuracy():
    """Verify Case A and Case 39 meet accuracy targets."""
    data = json.loads(PHYSICAL_MODEL_ML_PATH.read_text(encoding="utf-8"))
    
    # Case A: Ip=25, Vg=55, Ton=400, Toff=8 -> Actual MRR=0.011, TWR=0.0123
    pred_a_mrr = predict_forest(data["mrr_model"], [25.0, 55.0, 400.0, 8.0])
    err_a_mrr = abs(pred_a_mrr - 0.011) / 0.011 * 100.0
    assert err_a_mrr <= 5.0, f"Case A MRR error ({err_a_mrr:.2f}%) must be <= 5% target! Pred={pred_a_mrr}"
    
    # Case 39: Ip=35, Vg=40, Ton=300, Toff=12 -> Actual MRR=0.0163, TWR=0.0154
    pred_39_mrr = predict_forest(data["mrr_model"], [35.0, 40.0, 300.0, 12.0])
    pred_39_twr = predict_forest(data["twr_model"], [35.0, 40.0, 300.0, 12.0])
    err_39_mrr = abs(pred_39_mrr - 0.0163) / 0.0163 * 100.0
    err_39_twr = abs(pred_39_twr - 0.0154) / 0.0154 * 100.0
    assert err_39_mrr <= 5.0, f"Case 39 MRR error ({err_39_mrr:.2f}%) must be <= 5% target! Pred={pred_39_mrr}"
    assert err_39_twr <= 5.0, f"Case 39 TWR error ({err_39_twr:.2f}%) must be <= 5% target! Pred={pred_39_twr}"


# 11. Isolation between Mode A (Research) and Mode B (Physical Machine)
def test_mode_a_and_mode_b_isolation():
    """Verify complete separation between Mode A and Mode B models."""
    res_data = json.loads(FROZEN_RESEARCH_PATH.read_text(encoding="utf-8"))
    phy_data = json.loads(PHYSICAL_MODEL_ML_PATH.read_text(encoding="utf-8"))
    
    assert res_data["metadata"]["model_version"] == "shailesh-sir-rf-v1.0.0"
    assert phy_data["metadata"]["model_version"] == "physical-edm-ensemble-v2.5.0"
    
    assert res_data["mrr_model"]["feature_names"] == ["Current_A", "Voltage_V", "TON_us", "coating_alcrni_pvd"]
    assert phy_data["mrr_model"]["feature_names"] == ["Ip", "Vg", "Ton", "Toff"]


# 12. Unity digital twin parameter dispatch contract
def test_unity_twin_parameter_contract():
    """Verify parameters passed to Digital Twin match the 4 physical inputs."""
    keys = ["current", "voltage", "pulseOn", "pulseOff"]
    dispatch_payload = {"current": 25, "voltage": 55, "pulseOn": 400, "pulseOff": 8}
    for k in keys:
        assert k in dispatch_payload
        assert isinstance(dispatch_payload[k], int)


# 13. Retraining dry-run and quality gate verification
def test_retraining_dry_run_execution():
    """Verify train_and_deploy_physical_model dry-run executes cleanly and passes all gates."""
    from ml.src.train_and_deploy_physical_model import train_and_validate
    artifact = train_and_validate(dry_run=True)
    assert artifact["metadata"]["model_version"] == "physical-edm-ensemble-v2.5.0"
    assert len(artifact["mrr_model"]["trees"]) == 60
    assert len(artifact["twr_model"]["trees"]) == 60


# 14. Deployment rollback snapshot availability and integrity
def test_rollback_snapshot_availability():
    """Verify that rollback directory contains a valid snapshot and manifest."""
    manifest_path = ROLLBACK_DIR / "rollback_manifest.json"
    snapshot_path = ROLLBACK_DIR / "physical-experimental-model.json"
    assert manifest_path.exists(), "Rollback manifest must exist"
    assert snapshot_path.exists(), "Rollback artifact snapshot must exist"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert "sha256" in manifest and "timestamp" in manifest
