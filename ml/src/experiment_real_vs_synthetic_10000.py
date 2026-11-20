"""Comprehensive benchmark: Baseline (Real-Only) vs Augmented (Real + Synthetic from EDM_synthetic_10000.xlsx).

Evaluates models strictly on held-out REAL experimental measurements using GroupKFold.
"""

import json
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
    return df_real, df_syn

def evaluate_predictions(y_true: np.ndarray, y_pred: np.ndarray):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    
    # Handle zero/near-zero actuals for percentage error
    ape = np.abs(y_pred - y_true) / np.maximum(y_true, 1e-6) * 100.0
    mean_ape = np.mean(ape)
    median_ape = np.median(ape)
    max_ape = np.max(ape)
    within_5pct = np.mean(ape <= 5.0) * 100.0
    within_10pct = np.mean(ape <= 10.0) * 100.0
    within_20pct = np.mean(ape <= 20.0) * 100.0
    
    return {
        "mae": float(mae),
        "rmse": float(rmse),
        "r2": float(r2),
        "mean_ape": float(mean_ape),
        "median_ape": float(median_ape),
        "max_ape": float(max_ape),
        "within_5pct": float(within_5pct),
        "within_10pct": float(within_10pct),
        "within_20pct": float(within_20pct),
    }

def run_grouped_cv(
    df_real: pd.DataFrame,
    target_col: str,
    model_factory,
    synthetic_df: pd.DataFrame = None,
    synthetic_weight: float = 1.0,
    real_weight: float = 1.0,
):
    X_real = df_real[FEATURES].to_numpy(dtype=float)
    y_real = df_real[target_col].to_numpy(dtype=float)
    
    unique_conds, groups = np.unique(X_real, axis=0, return_inverse=True)
    gkf = GroupKFold(n_splits=5)
    
    oof_preds = np.zeros(len(df_real))
    
    for train_idx, test_idx in gkf.split(X_real, y_real, groups=groups):
        X_tr = X_real[train_idx]
        y_tr = y_real[train_idx]
        w_tr = np.full(len(X_tr), real_weight)
        
        if synthetic_df is not None and len(synthetic_df) > 0:
            # Prevent data leakage: exclude synthetic points that match holdout conditions
            test_keys = set(tuple(x) for x in X_real[test_idx])
            syn_clean = synthetic_df[
                ~synthetic_df[FEATURES].apply(lambda r: tuple(r) in test_keys, axis=1)
            ]
            X_syn = syn_clean[FEATURES].to_numpy(dtype=float)
            y_syn = syn_clean[target_col].to_numpy(dtype=float)
            w_syn = np.full(len(X_syn), synthetic_weight)
            
            X_combined = np.vstack([X_tr, X_syn])
            y_combined = np.concatenate([y_tr, y_syn])
            w_combined = np.concatenate([w_tr, w_syn])
        else:
            X_combined = X_tr
            y_combined = y_tr
            w_combined = w_tr
            
        model = model_factory()
        # Train model (with sample weight if supported)
        try:
            model.fit(X_combined, y_combined, sample_weight=w_combined)
        except TypeError:
            model.fit(X_combined, y_combined)
            
        oof_preds[test_idx] = model.predict(X_real[test_idx])
        
    return evaluate_predictions(y_real, oof_preds), oof_preds

def main():
    print("Loading data...")
    df_real, df_syn = load_data()
    print(f"Real experiments: {len(df_real)}")
    print(f"Synthetic total: {len(df_syn)}")
    
    syn_valid = df_syn[df_syn["Valid_For_Training"] == True].copy()
    print(f"Synthetic Valid_For_Training=True: {len(syn_valid)}")
    
    # Models to benchmark
    models = {
        "RandomForest_Default": lambda: RandomForestRegressor(n_estimators=100, random_state=RANDOM_STATE),
        "RandomForest_Tuned_60": lambda: RandomForestRegressor(n_estimators=60, max_depth=6, min_samples_split=3, random_state=RANDOM_STATE),
        "RandomForest_Constrained": lambda: RandomForestRegressor(n_estimators=100, max_depth=4, min_samples_leaf=2, random_state=RANDOM_STATE),
        "ExtraTrees_100": lambda: ExtraTreesRegressor(n_estimators=100, random_state=RANDOM_STATE),
        "GradientBoosting_50": lambda: GradientBoostingRegressor(n_estimators=50, max_depth=3, learning_rate=0.05, random_state=RANDOM_STATE),
        "HistGradientBoosting": lambda: HistGradientBoostingRegressor(max_iter=50, max_depth=3, random_state=RANDOM_STATE),
        "Ridge": lambda: Ridge(alpha=1.0),
    }
    
    for target in ["mrr", "twr"]:
        syn_target_col = target.upper() # in synthetic sheet: 'MRR', 'TWR'
        sigma_col = f"{syn_target_col}_Sigma_ln"
        
        # Sort synthetic by uncertainty
        syn_sorted = syn_valid.sort_values(by=sigma_col).copy()
        
        # Standardize target col in synthetic df to lowercase for cv function
        syn_sorted[target] = syn_sorted[syn_target_col]
        
        print(f"\n==========================================")
        print(f" BENCHMARK FOR TARGET: {target.upper()} (g/min)")
        print(f"==========================================")
        
        results = []
        
        # 1. Baseline: Real-only for all model types
        for name, factory in models.items():
            metrics, _ = run_grouped_cv(df_real, target, factory)
            results.append({
                "Strategy": f"Baseline (Real-Only) - {name}",
                "N_Real": len(df_real),
                "N_Syn": 0,
                **metrics,
            })
            
        # 2. Augmented: Random Forest Tuned with varying synthetic sizes & weights
        rf_factory = lambda: RandomForestRegressor(n_estimators=60, max_depth=6, min_samples_split=3, random_state=RANDOM_STATE)
        
        synthetic_subsets = [
            ("Top-50 Low-Sigma", syn_sorted.head(50)),
            ("Top-100 Low-Sigma", syn_sorted.head(100)),
            ("Top-250 Low-Sigma", syn_sorted.head(250)),
            ("Top-500 Low-Sigma", syn_sorted.head(500)),
            ("Top-1000 Low-Sigma", syn_sorted.head(1000)),
            ("All-7735 Valid", syn_sorted),
        ]
        
        weighting_ratios = [
            ("Equal (1:1)", 1.0, 1.0),
            ("Real 5x (5:1)", 5.0, 1.0),
            ("Real 10x (10:1)", 10.0, 1.0),
            ("Real 20x (20:1)", 20.0, 1.0),
        ]
        
        for sub_name, sub_df in synthetic_subsets:
            for w_name, r_w, s_w in weighting_ratios:
                metrics, _ = run_grouped_cv(
                    df_real, target, rf_factory,
                    synthetic_df=sub_df,
                    real_weight=r_w,
                    synthetic_weight=s_w,
                )
                results.append({
                    "Strategy": f"Augmented RF - {sub_name} - {w_name}",
                    "N_Real": len(df_real),
                    "N_Syn": len(sub_df),
                    **metrics,
                })
                
        # 3. Augmented Gradient Boosting with low-sigma synthetic
        gb_factory = lambda: GradientBoostingRegressor(n_estimators=50, max_depth=3, learning_rate=0.05, random_state=RANDOM_STATE)
        for sub_name, sub_df in [("Top-100 Low-Sigma", syn_sorted.head(100)), ("Top-500 Low-Sigma", syn_sorted.head(500))]:
            metrics, _ = run_grouped_cv(
                df_real, target, gb_factory,
                synthetic_df=sub_df,
                real_weight=5.0,
                synthetic_weight=1.0,
            )
            results.append({
                "Strategy": f"Augmented GB - {sub_name} - Real 5x",
                "N_Real": len(df_real),
                "N_Syn": len(sub_df),
                **metrics,
            })
            
        res_df = pd.DataFrame(results)
        res_df = res_df.sort_values(by="mae", ascending=True)
        
        print(f"\nTop 10 configurations for {target.upper()} sorted by MAE:")
        print(res_df[["Strategy", "N_Syn", "mae", "rmse", "r2", "mean_ape", "median_ape", "max_ape", "within_5pct"]].head(10).to_string(index=False))
        
        # Save full results to CSV
        OUT_REPORT = ROOT / "ml" / "reports" / f"benchmark_{target}_real_vs_synthetic_10000.csv"
        OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
        res_df.to_csv(OUT_REPORT, index=False)
        print(f"Saved full results to {OUT_REPORT}")

if __name__ == "__main__":
    main()
