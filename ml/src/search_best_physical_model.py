"""Systematic search for best physical EDM model architectures.
Evaluates Grouped 5-Fold Cross Validation strictly on real experimental holdouts.
"""

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    RandomForestRegressor,
    ExtraTreesRegressor,
    GradientBoostingRegressor,
    HistGradientBoostingRegressor,
)
from sklearn.linear_model import Ridge
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = Path(__file__).resolve().parents[2]
REAL_CSV = ROOT / "ml" / "data" / "physical_experiments" / "clean_physical_experiments.csv"
SYNTHETIC_XLSX = Path(r"C:\Users\ShubhamShaurya\Downloads\EDM_synthetic_10000.xlsx")
REPORTS_DIR = ROOT / "ml" / "reports"
FEATURES = ["Ip", "Vg", "Ton", "Toff"]
RANDOM_STATE = 20261012

def load_data():
    df_real = pd.read_csv(REAL_CSV)
    df_syn = pd.read_excel(SYNTHETIC_XLSX, sheet_name="Synthetic_Training_Data")
    df_syn = df_syn[df_syn["Valid_For_Training"] == True].copy()
    df_syn["mrr"] = df_syn["MRR"].astype(float)
    df_syn["twr"] = df_syn["TWR"].astype(float)
    return df_real, df_syn

def evaluate_predictions(y_true, y_pred, mask=None):
    if mask is not None:
        y_true = y_true[mask]
        y_pred = y_pred[mask]
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    denom = np.sum((y_true - np.mean(y_true)) ** 2)
    r2 = 1.0 - (np.sum((y_true - y_pred) ** 2) / denom) if denom > 1e-14 else 0.0
    ape = np.abs(y_pred - y_true) / np.maximum(y_true, 1e-6) * 100.0
    return {
        "n": len(y_true),
        "mae": float(mae),
        "rmse": float(rmse),
        "r2": float(r2),
        "mean_ape": float(np.mean(ape)),
        "median_ape": float(np.median(ape)),
        "max_ape": float(np.max(ape)),
        "pct_within_5": float(np.mean(ape <= 5.0) * 100.0),
        "pct_within_10": float(np.mean(ape <= 10.0) * 100.0),
        "pct_within_20": float(np.mean(ape <= 20.0) * 100.0),
    }

def main():
    df_real, df_syn = load_data()
    X_real = df_real[FEATURES].to_numpy(dtype=float)
    y_mrr_real = df_real["mrr"].to_numpy(dtype=float)
    y_twr_real = df_real["twr"].to_numpy(dtype=float)
    
    unique_conds, groups = np.unique(X_real, axis=0, return_inverse=True)
    gkf = GroupKFold(n_splits=5)
    
    # Masks for Major Operating Conditions:
    # 1. Primary Major: Ip >= 20 A and Ton >= 200 us (29 runs) - standard production EDM regime
    mask_major_primary = ((df_real["Ip"] >= 20) & (df_real["Ton"] >= 200)).to_numpy()
    # 2. Substantial MRR: MRR >= 0.010 g/min (19 runs) - measurable cutting rate well above balance resolution
    mask_major_mrr10 = (df_real["mrr"] >= 0.010).to_numpy()
    # 3. High discharge energy: Ip * Ton >= 4000 (31 runs)
    mask_major_energy = ((df_real["Ip"] * df_real["Ton"]) >= 4000).to_numpy()
    
    candidate_configs = [
        # (name, target, use_log, factory, weight)
        ("RF_d12_leaf1_w20", "mrr", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE), 20.0),
        ("RF_d12_leaf1_w50", "mrr", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE), 50.0),
        ("RF_d14_leaf1_w30", "mrr", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=14, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE), 30.0),
        ("RF_d10_leaf2_w10", "mrr", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=10, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE), 10.0),
        ("RF_d12_leaf2_w10", "mrr", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE), 10.0),
        ("RF_Log_d12_leaf1_w20", "mrr", True, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE), 20.0),
        ("RF_Log_d12_leaf1_w50", "mrr", True, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE), 50.0),
        ("ET_d12_leaf1_w20", "mrr", False, lambda: ExtraTreesRegressor(n_estimators=60, max_depth=12, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE), 20.0),
        ("GB_d4_lr08_w10", "mrr", False, lambda: GradientBoostingRegressor(n_estimators=60, max_depth=4, learning_rate=0.08, random_state=RANDOM_STATE), 10.0),
        
        # TWR candidates
        ("RF_d12_leaf1_w20", "twr", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE + 1), 20.0),
        ("RF_d12_leaf1_w50", "twr", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE + 1), 50.0),
        ("RF_d14_leaf1_w30", "twr", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=14, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE + 1), 30.0),
        ("RF_d10_leaf2_w10", "twr", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=10, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE + 1), 10.0),
        ("RF_d12_leaf2_w10", "twr", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE + 1), 10.0),
        ("RF_Log_d12_leaf1_w20", "twr", True, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE + 1), 20.0),
        ("RF_Log_d12_leaf1_w50", "twr", True, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE + 1), 50.0),
        ("ET_d12_leaf1_w20", "twr", False, lambda: ExtraTreesRegressor(n_estimators=60, max_depth=12, min_samples_leaf=1, max_features=3, random_state=RANDOM_STATE + 1), 20.0),
        ("GB_d4_lr08_w10", "twr", False, lambda: GradientBoostingRegressor(n_estimators=60, max_depth=4, learning_rate=0.08, random_state=RANDOM_STATE + 1), 10.0),
    ]
    
    results = []
    
    for name, target, use_log, factory, weight in candidate_configs:
        y_real = y_mrr_real if target == "mrr" else y_twr_real
        oof_preds = np.zeros(len(df_real))
        
        for train_idx, test_idx in gkf.split(X_real, y_real, groups=groups):
            test_keys = set(tuple(x) for x in X_real[test_idx])
            syn_clean = df_syn[~df_syn[FEATURES].apply(lambda r: tuple(r) in test_keys, axis=1)]
            
            X_tr = np.vstack([X_real[train_idx], syn_clean[FEATURES].to_numpy(dtype=float)])
            w_tr = np.concatenate([np.full(len(train_idx), weight), np.full(len(syn_clean), 1.0)])
            y_tr = np.concatenate([y_real[train_idx], syn_clean[target].to_numpy(dtype=float)])
            
            if use_log:
                y_tr = np.log(np.maximum(y_tr, 1e-6))
                
            model = factory()
            model.fit(X_tr, y_tr, sample_weight=w_tr)
            preds = model.predict(X_real[test_idx])
            if use_log:
                preds = np.exp(preds)
            oof_preds[test_idx] = preds
            
        m_all = evaluate_predictions(y_real, oof_preds)
        m_major = evaluate_predictions(y_real, oof_preds, mask_major_primary)
        m_mrr10 = evaluate_predictions(y_real, oof_preds, mask_major_mrr10)
        
        res = {
            "Config": name,
            "Target": target,
            "LogTarget": use_log,
            "Weight": weight,
            "All_MAE": m_all["mae"],
            "All_RMSE": m_all["rmse"],
            "All_R2": m_all["r2"],
            "All_MeanAPE": m_all["mean_ape"],
            "All_MedAPE": m_all["median_ape"],
            "All_MaxAPE": m_all["max_ape"],
            "All_PctWithin5": m_all["pct_within_5"],
            "All_PctWithin10": m_all["pct_within_10"],
            "Major_MAE": m_major["mae"],
            "Major_RMSE": m_major["rmse"],
            "Major_R2": m_major["r2"],
            "Major_MeanAPE": m_major["mean_ape"],
            "Major_MedAPE": m_major["median_ape"],
            "Major_MaxAPE": m_major["max_ape"],
            "Major_PctWithin5": m_major["pct_within_5"],
            "MRR10_MAE": m_mrr10["mae"],
            "MRR10_MeanAPE": m_mrr10["mean_ape"],
            "MRR10_PctWithin5": m_mrr10["pct_within_5"],
        }
        results.append(res)
        print(f"[{target.upper()}] {name:20s} | All MAE: {m_all['mae']:.5f} R2: {m_all['r2']:.3f} <=5%: {m_all['pct_within_5']:4.1f}% | Major MAE: {m_major['mae']:.5f} MAPE: {m_major['mean_ape']:4.1f}% <=5%: {m_major['pct_within_5']:4.1f}%", flush=True)
        
    df_res = pd.DataFrame(results)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    df_res.to_csv(REPORTS_DIR / "physical_model_search_results.csv", index=False)
    print(f"\nSaved search results to {REPORTS_DIR / 'physical_model_search_results.csv'}")

if __name__ == "__main__":
    main()
