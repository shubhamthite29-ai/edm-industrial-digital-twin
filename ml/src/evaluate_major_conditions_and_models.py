"""Evaluate multiple model architectures and define major operating conditions for MRR and TWR.

Evaluates Grouped 5-Fold Cross Validation strictly on held-out real physical experiments.
"""

import sys
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
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = Path(__file__).resolve().parents[2]
REAL_CSV = ROOT / "ml" / "data" / "physical_experiments" / "clean_physical_experiments.csv"
SYNTHETIC_XLSX = Path(r"C:\Users\ShubhamShaurya\Downloads\EDM_synthetic_10000.xlsx")
FEATURES = ["Ip", "Vg", "Ton", "Toff"]
RANDOM_STATE = 20261012

def load_data():
    df_real = pd.read_csv(REAL_CSV)
    df_syn = pd.read_excel(SYNTHETIC_XLSX, sheet_name="Synthetic_Training_Data")
    df_syn = df_syn[df_syn["Valid_For_Training"] == True].copy()
    df_syn["mrr"] = df_syn["MRR"].astype(float)
    df_syn["twr"] = df_syn["TWR"].astype(float)
    return df_real, df_syn

def run_evaluation():
    df_real, df_syn = load_data()
    X_real = df_real[FEATURES].to_numpy(dtype=float)
    y_mrr_real = df_real["mrr"].to_numpy(dtype=float)
    y_twr_real = df_real["twr"].to_numpy(dtype=float)
    
    unique_conds, groups = np.unique(X_real, axis=0, return_inverse=True)
    gkf = GroupKFold(n_splits=5)
    
    # Candidate major condition masks
    major_definitions = {
        "Def 1: Ip >= 25 A": (df_real["Ip"] >= 25).to_numpy(),
        "Def 2: Ip >= 20 A and Ton >= 200 us": ((df_real["Ip"] >= 20) & (df_real["Ton"] >= 200)).to_numpy(),
        "Def 3: MRR >= 0.010 g/min": (df_real["mrr"] >= 0.010).to_numpy(),
        "Def 4: Ip * Ton >= 4000": ((df_real["Ip"] * df_real["Ton"]) >= 4000).to_numpy(),
    }
    
    print(f"Total real experiments: {len(df_real)}", flush=True)
    for def_name, mask in major_definitions.items():
        print(f"  {def_name}: {mask.sum()} / {len(df_real)} runs ({mask.sum()/len(df_real)*100:.1f}%)", flush=True)
        
    models_to_test = [
        ("RF_Linear_w5", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE), 5.0),
        ("RF_Linear_w10", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE), 10.0),
        ("RF_Linear_w20", False, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE), 20.0),
        ("RF_Log_w5", True, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE), 5.0),
        ("RF_Log_w10", True, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE), 10.0),
        ("RF_Log_w20", True, lambda: RandomForestRegressor(n_estimators=60, max_depth=12, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE), 20.0),
        ("ET_Linear_w5", False, lambda: ExtraTreesRegressor(n_estimators=60, max_depth=12, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE), 5.0),
        ("ET_Log_w5", True, lambda: ExtraTreesRegressor(n_estimators=60, max_depth=12, min_samples_leaf=2, max_features=3, random_state=RANDOM_STATE), 5.0),
        ("GB_Linear_w5", False, lambda: GradientBoostingRegressor(n_estimators=60, max_depth=4, learning_rate=0.08, random_state=RANDOM_STATE), 5.0),
        ("GB_Log_w5", True, lambda: GradientBoostingRegressor(n_estimators=60, max_depth=4, learning_rate=0.08, random_state=RANDOM_STATE), 5.0),
    ]
    
    print("\n" + "="*80, flush=True)
    print(" BENCHMARK FOR MRR (Holdout Cross-Validation)", flush=True)
    print("="*80, flush=True)
    
    mrr_results = []
    for name, use_log, factory, real_weight in models_to_test:
        oof_preds = np.zeros(len(df_real))
        for train_idx, test_idx in gkf.split(X_real, y_mrr_real, groups=groups):
            test_keys = set(tuple(x) for x in X_real[test_idx])
            syn_clean = df_syn[~df_syn[FEATURES].apply(lambda r: tuple(r) in test_keys, axis=1)]
            
            X_tr = np.vstack([X_real[train_idx], syn_clean[FEATURES].to_numpy(dtype=float)])
            w_tr = np.concatenate([np.full(len(train_idx), real_weight), np.full(len(syn_clean), 1.0)])
            
            y_tr = np.concatenate([y_mrr_real[train_idx], syn_clean["mrr"].to_numpy(dtype=float)])
            if use_log:
                y_tr = np.log(np.maximum(y_tr, 1e-6))
                
            model = factory()
            model.fit(X_tr, y_tr, sample_weight=w_tr)
            preds = model.predict(X_real[test_idx])
            if use_log:
                preds = np.exp(preds)
            oof_preds[test_idx] = preds
            
        mae_all = mean_absolute_error(y_mrr_real, oof_preds)
        rmse_all = np.sqrt(mean_squared_error(y_mrr_real, oof_preds))
        r2_all = r2_score(y_mrr_real, oof_preds)
        ape_all = np.abs(oof_preds - y_mrr_real) / y_mrr_real * 100.0
        pct_within_5_all = np.mean(ape_all <= 5.0) * 100.0
        
        row = {
            "Model": name,
            "All_MAE": mae_all,
            "All_R2": r2_all,
            "All_MAPE": np.mean(ape_all),
            "All_%<=5": pct_within_5_all,
        }
        
        for def_name, mask in major_definitions.items():
            sub_ape = ape_all[mask]
            row[f"{def_name}_MAPE"] = np.mean(sub_ape)
            row[f"{def_name}_%<=5"] = np.mean(sub_ape <= 5.0) * 100.0
            row[f"{def_name}_MaxAPE"] = np.max(sub_ape)
            row[f"{def_name}_MAE"] = mean_absolute_error(y_mrr_real[mask], oof_preds[mask])
            
        mrr_results.append(row)
        print(f"MRR {name:16s} | All MAE: {mae_all:.5f} R2: {r2_all:.3f} <=5%: {pct_within_5_all:4.1f}% | Def3 (MRR>=0.01) MAE: {row['Def 3: MRR >= 0.010 g/min_MAE']:.5f} MAPE: {row['Def 3: MRR >= 0.010 g/min_MAPE']:4.1f}% <=5%: {row['Def 3: MRR >= 0.010 g/min_%<=5']:4.1f}%", flush=True)

    print("\n" + "="*80, flush=True)
    print(" BENCHMARK FOR TWR (Holdout Cross-Validation)", flush=True)
    print("="*80, flush=True)
    
    twr_results = []
    for name, use_log, factory, real_weight in models_to_test:
        oof_preds = np.zeros(len(df_real))
        for train_idx, test_idx in gkf.split(X_real, y_twr_real, groups=groups):
            test_keys = set(tuple(x) for x in X_real[test_idx])
            syn_clean = df_syn[~df_syn[FEATURES].apply(lambda r: tuple(r) in test_keys, axis=1)]
            
            X_tr = np.vstack([X_real[train_idx], syn_clean[FEATURES].to_numpy(dtype=float)])
            w_tr = np.concatenate([np.full(len(train_idx), real_weight), np.full(len(syn_clean), 1.0)])
            
            y_tr = np.concatenate([y_twr_real[train_idx], syn_clean["twr"].to_numpy(dtype=float)])
            if use_log:
                y_tr = np.log(np.maximum(y_tr, 1e-6))
                
            model = factory()
            model.fit(X_tr, y_tr, sample_weight=w_tr)
            preds = model.predict(X_real[test_idx])
            if use_log:
                preds = np.exp(preds)
            oof_preds[test_idx] = preds
            
        mae_all = mean_absolute_error(y_twr_real, oof_preds)
        rmse_all = np.sqrt(mean_squared_error(y_twr_real, oof_preds))
        r2_all = r2_score(y_twr_real, oof_preds)
        ape_all = np.abs(oof_preds - y_twr_real) / y_twr_real * 100.0
        pct_within_5_all = np.mean(ape_all <= 5.0) * 100.0
        
        row = {
            "Model": name,
            "All_MAE": mae_all,
            "All_R2": r2_all,
            "All_MAPE": np.mean(ape_all),
            "All_%<=5": pct_within_5_all,
        }
        twr_results.append(row)
        print(f"TWR {name:16s} | All MAE: {mae_all:.5f} R2: {r2_all:.3f} MAPE: {np.mean(ape_all):4.1f}% <=5%: {pct_within_5_all:4.1f}%", flush=True)

if __name__ == "__main__":
    run_evaluation()
