"""Comprehensive physical EDM ML optimization, model selection, synthetic augmentation, and validation engine.

Evaluates multiple model families, feature engineering transformations, synthetic augmentation strategies,
and target transformations across strictly leak-free grouped cross-validation folds.
"""

import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.base import clone, BaseEstimator, RegressorMixin
from sklearn.ensemble import (
    RandomForestRegressor,
    ExtraTreesRegressor,
    GradientBoostingRegressor,
    HistGradientBoostingRegressor,
)
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel as C, WhiteKernel
from sklearn.linear_model import Ridge, ElasticNet
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.pipeline import Pipeline
from sklearn.svm import SVR
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = Path(__file__).resolve().parents[2]
REAL_CSV = ROOT / "ml" / "data" / "physical_experiments" / "clean_physical_experiments.csv"
SYNTHETIC_XLSX = Path(r"C:\Users\ShubhamShaurya\Downloads\EDM_synthetic_10000.xlsx")
REPORTS_DIR = ROOT / "ml" / "reports"
MODELS_DIR = ROOT / "ml" / "models"

BASE_FEATURES = ["Ip", "Vg", "Ton", "Toff"]
RANDOM_STATE = 20261012

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Adds physically grounded EDM process features."""
    df_out = df.copy()
    ip = df_out["Ip"].astype(float)
    vg = df_out["Vg"].astype(float)
    ton = df_out["Ton"].astype(float)
    toff = df_out["Toff"].astype(float)
    
    period = ton + toff
    duty_cycle = ton / period
    freq = 1e6 / period
    discharge_energy = ip * vg * ton
    avg_power = ip * vg * duty_cycle
    peak_power = ip * vg
    
    df_out["period"] = period
    df_out["duty_cycle"] = duty_cycle
    df_out["freq"] = freq
    df_out["discharge_energy"] = discharge_energy
    df_out["avg_power"] = avg_power
    df_out["peak_power"] = peak_power
    
    return df_out

def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, is_major_mask: np.ndarray = None):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    
    # Avoid division by zero for micro readings
    denom = np.maximum(np.abs(y_true), 1e-6)
    ape = np.abs(y_pred - y_true) / denom * 100.0
    
    med_ape = np.median(ape)
    mean_ape = np.mean(ape)
    pct_within_2 = np.mean(ape <= 2.0) * 100.0
    pct_within_5 = np.mean(ape <= 5.0) * 100.0
    pct_within_10 = np.mean(ape <= 10.0) * 100.0
    max_ape = np.max(ape)
    worst_abs_err = np.max(np.abs(y_pred - y_true))
    
    res = {
        "mae": float(mae),
        "rmse": float(rmse),
        "r2": float(r2),
        "med_ape": float(med_ape),
        "mean_ape": float(mean_ape),
        "pct_within_2": float(pct_within_2),
        "pct_within_5": float(pct_within_5),
        "pct_within_10": float(pct_within_10),
        "max_ape": float(max_ape),
        "worst_abs_err": float(worst_abs_err),
    }
    
    if is_major_mask is not None and np.sum(is_major_mask) > 2:
        y_true_maj = y_true[is_major_mask]
        y_pred_maj = y_pred[is_major_mask]
        ape_maj = ape[is_major_mask]
        res["maj_mae"] = float(mean_absolute_error(y_true_maj, y_pred_maj))
        res["maj_rmse"] = float(np.sqrt(mean_squared_error(y_true_maj, y_pred_maj)))
        res["maj_r2"] = float(r2_score(y_true_maj, y_pred_maj))
        res["maj_med_ape"] = float(np.median(ape_maj))
        res["maj_pct_within_2"] = float(np.mean(ape_maj <= 2.0) * 100.0)
        res["maj_pct_within_5"] = float(np.mean(ape_maj <= 5.0) * 100.0)
    else:
        res["maj_mae"] = res["mae"]
        res["maj_rmse"] = res["rmse"]
        res["maj_r2"] = res["r2"]
        res["maj_med_ape"] = res["med_ape"]
        res["maj_pct_within_2"] = res["pct_within_2"]
        res["maj_pct_within_5"] = res["pct_within_5"]
        
    return res

class BlendedEnsemble(BaseEstimator, RegressorMixin):
    def __init__(self, estimators_weights):
        self.estimators_weights = estimators_weights
        self.fitted_estimators = []
        
    def fit(self, X, y, sample_weight=None):
        self.fitted_estimators = []
        for est, w in self.estimators_weights:
            e = clone(est)
            if sample_weight is not None:
                try:
                    e.fit(X, y, sample_weight=sample_weight)
                except TypeError:
                    e.fit(X, y)
            else:
                e.fit(X, y)
            self.fitted_estimators.append((e, w))
        return self
        
    def predict(self, X):
        preds = np.zeros(len(X))
        total_w = sum(w for _, w in self.fitted_estimators)
        for e, w in self.fitted_estimators:
            preds += w * e.predict(X)
        return preds / total_w

class LogTargetRegressor(BaseEstimator, RegressorMixin):
    def __init__(self, base_estimator):
        self.base_estimator = base_estimator
        self.fitted_estimator = None
        
    def fit(self, X, y, sample_weight=None):
        self.fitted_estimator = clone(self.base_estimator)
        # Shift slightly if y <= 0
        min_y = np.min(y)
        self.offset_ = 1e-5 if min_y <= 0 else 0.0
        y_log = np.log(y + self.offset_)
        if sample_weight is not None:
            try:
                self.fitted_estimator.fit(X, y_log, sample_weight=sample_weight)
            except TypeError:
                self.fitted_estimator.fit(X, y_log)
        else:
            self.fitted_estimator.fit(X, y_log)
        return self
        
    def predict(self, X):
        pred_log = self.fitted_estimator.predict(X)
        pred = np.exp(pred_log) - self.offset_
        return np.maximum(pred, 1e-6)

def run_comprehensive_benchmark():
    df_real = pd.read_csv(REAL_CSV)
    df_syn = pd.read_excel(SYNTHETIC_XLSX)
    
    # Define groups for leak-free GroupKFold
    df_real["cond_key"] = (
        df_real["Ip"].astype(str) + "_" +
        df_real["Vg"].astype(str) + "_" +
        df_real["Ton"].astype(str) + "_" +
        df_real["Toff"].astype(str)
    )
    unique_groups = df_real["cond_key"].unique()
    group_map = {k: i for i, k in enumerate(unique_groups)}
    groups = df_real["cond_key"].map(group_map).values
    
    gkf = GroupKFold(n_splits=5)
    splits = list(gkf.split(df_real, groups=groups))
    
    # Diagnostic cases
    case_a = np.array([[25.0, 55.0, 400.0, 8.0]])
    case_b = np.array([[35.0, 40.0, 300.0, 12.0]])
    actual_a_mrr, actual_a_twr = 0.0110, 0.0123
    actual_b_mrr, actual_b_twr = 0.0163, 0.0154
    
    # Major operating condition definition: Ip >= 20 and Ton >= 200
    is_major_mask = ((df_real["Ip"] >= 20) & (df_real["Ton"] >= 200)).values
    
    # Models to benchmark
    candidate_defs = [
        # 1. Deployed Baseline Ensemble v2.2.0
        ("v2.2.0 Ensemble (42 RF + 18 ET, d=5)", "ensemble_v22", {}),
        # 2. Pure Random Forest family
        ("Random Forest (60 trees, d=5)", "rf", {"n_estimators": 60, "max_depth": 5, "min_samples_leaf": 1}),
        ("Random Forest (100 trees, d=6)", "rf", {"n_estimators": 100, "max_depth": 6, "min_samples_leaf": 1}),
        ("Random Forest (40 trees, d=4, leaf=2)", "rf", {"n_estimators": 40, "max_depth": 4, "min_samples_leaf": 2}),
        # 3. Pure Extra Trees family
        ("Extra Trees (60 trees, d=5)", "et", {"n_estimators": 60, "max_depth": 5, "min_samples_leaf": 1}),
        ("Extra Trees (100 trees, d=6)", "et", {"n_estimators": 100, "max_depth": 6, "min_samples_leaf": 1}),
        ("Extra Trees (40 trees, d=4, leaf=2)", "et", {"n_estimators": 40, "max_depth": 4, "min_samples_leaf": 2}),
        # 4. Gradient Boosting
        ("Gradient Boosting (40 trees, lr=0.08, d=3)", "gbdt", {"n_estimators": 40, "learning_rate": 0.08, "max_depth": 3}),
        ("Gradient Boosting (60 trees, lr=0.05, d=3)", "gbdt", {"n_estimators": 60, "learning_rate": 0.05, "max_depth": 3}),
        # 5. Linear / Polynomial / Kernel Baselines
        ("Ridge Regression (alpha=1.0)", "ridge", {"alpha": 1.0}),
        ("ElasticNet (alpha=0.01, l1=0.5)", "enet", {"alpha": 0.01, "l1_ratio": 0.5}),
        ("Polynomial Features (deg=2) + Ridge", "poly_ridge", {"alpha": 5.0}),
        ("Support Vector Regression (RBF, C=10)", "svr", {"C": 10.0, "epsilon": 0.001}),
        # 6. Gaussian Process Regression
        ("Gaussian Process (ARD RBF + WhiteNoise)", "gpr", {}),
        # 7. Log-Target Transformations
        ("Log-Target RF (60 trees, d=5)", "log_rf", {"n_estimators": 60, "max_depth": 5}),
        ("Log-Target Extra Trees (60 trees, d=5)", "log_et", {"n_estimators": 60, "max_depth": 5}),
        # 8. Feature Engineering (Physics Proxy Features)
        ("Physics Features + RF (60 trees, d=5)", "fe_rf", {"n_estimators": 60, "max_depth": 5}),
        ("Physics Features + Extra Trees (60 trees, d=5)", "fe_et", {"n_estimators": 60, "max_depth": 5}),
        # 9. Synthetic Augmentation Strategies
        ("Augmented v2.1.0 (Real + 7735 Synthetic Unweighted)", "syn_full_unweighted", {}),
        ("Augmented Filtered (Low Uncertainty Sigma_ln < 0.35)", "syn_filtered", {}),
        ("Augmented Weighted (Ratio 10% Synthetic Mass)", "syn_ratio_10", {"ratio": 0.10}),
        ("Augmented Weighted (Ratio 5% Synthetic Mass)", "syn_ratio_5", {"ratio": 0.05}),
        ("Augmented In-Fold GP Surrogate (Zero Leakage)", "syn_infold_gp", {"n_syn": 100}),
    ]
    
    results = []
    
    for target in ["mrr", "twr"]:
        y_real = df_real[target].values
        X_real_raw = df_real[BASE_FEATURES]
        df_real_fe = engineer_features(df_real)
        fe_cols = ["Ip", "Vg", "Ton", "Toff", "period", "duty_cycle", "discharge_energy", "avg_power"]
        X_real_fe = df_real_fe[fe_cols]
        
        # Diagnostic cases feature vectors
        df_case_a = pd.DataFrame([{"Ip": 25.0, "Vg": 55.0, "Ton": 400.0, "Toff": 8.0}])
        df_case_b = pd.DataFrame([{"Ip": 35.0, "Vg": 40.0, "Ton": 300.0, "Toff": 12.0}])
        df_case_a_fe = engineer_features(df_case_a)[fe_cols]
        df_case_b_fe = engineer_features(df_case_b)[fe_cols]
        
        target_actual_a = actual_a_mrr if target == "mrr" else actual_a_twr
        target_actual_b = actual_b_mrr if target == "mrr" else actual_b_twr
        
        for name, mtype, params in candidate_defs:
            oof_preds = np.zeros(len(df_real))
            
            # Cross-validation loop
            for train_idx, val_idx in splits:
                X_tr_base = X_real_raw.iloc[train_idx].values
                y_tr = y_real[train_idx]
                X_val_base = X_real_raw.iloc[val_idx].values
                
                X_tr_fe = X_real_fe.iloc[train_idx].values
                X_val_fe = X_real_fe.iloc[val_idx].values
                
                # Model instantiation and fitting per fold
                if mtype == "ensemble_v22":
                    rf = RandomForestRegressor(n_estimators=42, max_depth=5, random_state=RANDOM_STATE)
                    et = ExtraTreesRegressor(n_estimators=18, max_depth=5, random_state=RANDOM_STATE)
                    rf.fit(X_tr_base, y_tr)
                    et.fit(X_tr_base, y_tr)
                    val_pred = (42 * rf.predict(X_val_base) + 18 * et.predict(X_val_base)) / 60.0
                    
                elif mtype == "rf":
                    model = RandomForestRegressor(**params, random_state=RANDOM_STATE)
                    model.fit(X_tr_base, y_tr)
                    val_pred = model.predict(X_val_base)
                    
                elif mtype == "et":
                    model = ExtraTreesRegressor(**params, random_state=RANDOM_STATE)
                    model.fit(X_tr_base, y_tr)
                    val_pred = model.predict(X_val_base)
                    
                elif mtype == "gbdt":
                    model = GradientBoostingRegressor(**params, random_state=RANDOM_STATE)
                    model.fit(X_tr_base, y_tr)
                    val_pred = model.predict(X_val_base)
                    
                elif mtype == "ridge":
                    pipe = Pipeline([("scaler", StandardScaler()), ("model", Ridge(**params))])
                    pipe.fit(X_tr_base, y_tr)
                    val_pred = pipe.predict(X_val_base)
                    
                elif mtype == "enet":
                    pipe = Pipeline([("scaler", StandardScaler()), ("model", ElasticNet(**params))])
                    pipe.fit(X_tr_base, y_tr)
                    val_pred = pipe.predict(X_val_base)
                    
                elif mtype == "poly_ridge":
                    pipe = Pipeline([
                        ("poly", PolynomialFeatures(degree=2, include_bias=False)),
                        ("scaler", StandardScaler()),
                        ("model", Ridge(**params))
                    ])
                    pipe.fit(X_tr_base, y_tr)
                    val_pred = pipe.predict(X_val_base)
                    
                elif mtype == "svr":
                    pipe = Pipeline([("scaler", StandardScaler()), ("model", SVR(**params))])
                    pipe.fit(X_tr_base, y_tr)
                    val_pred = pipe.predict(X_val_base)
                    
                elif mtype == "gpr":
                    kernel = C(1.0, (1e-3, 1e3)) * RBF([10.0, 10.0, 200.0, 4.0], (1e-2, 1e4)) + WhiteKernel(1e-4, (1e-6, 1e-2))
                    pipe = Pipeline([
                        ("scaler", StandardScaler()),
                        ("model", GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=2, random_state=RANDOM_STATE))
                    ])
                    pipe.fit(X_tr_base, y_tr)
                    val_pred = pipe.predict(X_val_base)
                    
                elif mtype == "log_rf":
                    model = LogTargetRegressor(RandomForestRegressor(**params, random_state=RANDOM_STATE))
                    model.fit(X_tr_base, y_tr)
                    val_pred = model.predict(X_val_base)
                    
                elif mtype == "log_et":
                    model = LogTargetRegressor(ExtraTreesRegressor(**params, random_state=RANDOM_STATE))
                    model.fit(X_tr_base, y_tr)
                    val_pred = model.predict(X_val_base)
                    
                elif mtype == "fe_rf":
                    model = RandomForestRegressor(**params, random_state=RANDOM_STATE)
                    model.fit(X_tr_fe, y_tr)
                    val_pred = model.predict(X_val_fe)
                    
                elif mtype == "fe_et":
                    model = ExtraTreesRegressor(**params, random_state=RANDOM_STATE)
                    model.fit(X_tr_fe, y_tr)
                    val_pred = model.predict(X_val_fe)
                    
                elif mtype == "syn_full_unweighted":
                    # Real + full 7735 synthetic
                    syn_valid = df_syn[df_syn["Valid_For_Training"] == True]
                    X_syn = syn_valid[BASE_FEATURES].values
                    y_syn = syn_valid[target.upper()].values
                    X_comb = np.vstack([X_tr_base, X_syn])
                    y_comb = np.concatenate([y_tr, y_syn])
                    model = RandomForestRegressor(n_estimators=60, max_depth=6, random_state=RANDOM_STATE)
                    model.fit(X_comb, y_comb)
                    val_pred = model.predict(X_val_base)
                    
                elif mtype == "syn_filtered":
                    # Filter synthetic by uncertainty sigma_ln < 0.35 and leverage < 0.15
                    mask = (df_syn["Valid_For_Training"] == True) & (df_syn[f"{target.upper()}_Sigma_ln"] < 0.35) & (df_syn["Leverage"] < 0.15)
                    syn_filt = df_syn[mask]
                    if len(syn_filt) > 0:
                        X_syn = syn_filt[BASE_FEATURES].values
                        y_syn = syn_filt[target.upper()].values
                        X_comb = np.vstack([X_tr_base, X_syn])
                        y_comb = np.concatenate([y_tr, y_syn])
                    else:
                        X_comb, y_comb = X_tr_base, y_tr
                    model = RandomForestRegressor(n_estimators=60, max_depth=5, random_state=RANDOM_STATE)
                    model.fit(X_comb, y_comb)
                    val_pred = model.predict(X_val_base)
                    
                elif mtype.startswith("syn_ratio_"):
                    # Weighting synthetic samples so their total weight equals ratio * total real weight
                    ratio = params["ratio"]
                    syn_valid = df_syn[df_syn["Valid_For_Training"] == True]
                    X_syn = syn_valid[BASE_FEATURES].values
                    y_syn = syn_valid[target.upper()].values
                    
                    n_real = len(X_tr_base)
                    n_syn = len(X_syn)
                    w_real = np.ones(n_real)
                    # each synthetic sample weight
                    w_syn_each = (ratio * n_real) / n_syn
                    w_syn = np.full(n_syn, w_syn_each)
                    
                    X_comb = np.vstack([X_tr_base, X_syn])
                    y_comb = np.concatenate([y_tr, y_syn])
                    w_comb = np.concatenate([w_real, w_syn])
                    
                    model = RandomForestRegressor(n_estimators=60, max_depth=5, random_state=RANDOM_STATE)
                    model.fit(X_comb, y_comb, sample_weight=w_comb)
                    val_pred = model.predict(X_val_base)
                    
                elif mtype == "syn_infold_gp":
                    # Strict zero-leakage: fit a GP ONLY on X_tr_base, sample grid points, and augment
                    kernel = C(1.0) * RBF([10.0, 10.0, 200.0, 4.0]) + WhiteKernel(1e-4)
                    gp = GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=1, random_state=RANDOM_STATE)
                    gp.fit(X_tr_base, y_tr)
                    
                    # Generate 100 synthetic points uniformly across bounding box of training fold
                    lows = X_tr_base.min(axis=0)
                    highs = X_tr_base.max(axis=0)
                    np.random.seed(RANDOM_STATE)
                    X_syn_infold = np.random.uniform(lows, highs, size=(params["n_syn"], 4))
                    y_syn_infold, std_syn = gp.predict(X_syn_infold, return_std=True)
                    
                    # Augment with low weight (ratio 0.1)
                    w_real = np.ones(len(X_tr_base))
                    w_syn = np.full(len(X_syn_infold), (0.1 * len(X_tr_base)) / len(X_syn_infold))
                    
                    X_comb = np.vstack([X_tr_base, X_syn_infold])
                    y_comb = np.concatenate([y_tr, y_syn_infold])
                    w_comb = np.concatenate([w_real, w_syn])
                    
                    model = RandomForestRegressor(n_estimators=60, max_depth=5, random_state=RANDOM_STATE)
                    model.fit(X_comb, y_comb, sample_weight=w_comb)
                    val_pred = model.predict(X_val_base)
                    
                oof_preds[val_idx] = val_pred
                
            # Full model fit on all data to evaluate diagnostic cases A and B
            if mtype == "ensemble_v22":
                rf_full = RandomForestRegressor(n_estimators=42, max_depth=5, random_state=RANDOM_STATE).fit(X_real_raw.values, y_real)
                et_full = ExtraTreesRegressor(n_estimators=18, max_depth=5, random_state=RANDOM_STATE).fit(X_real_raw.values, y_real)
                pred_a = (42 * rf_full.predict(case_a)[0] + 18 * et_full.predict(case_a)[0]) / 60.0
                pred_b = (42 * rf_full.predict(case_b)[0] + 18 * et_full.predict(case_b)[0]) / 60.0
            elif mtype == "rf":
                m_full = RandomForestRegressor(**params, random_state=RANDOM_STATE).fit(X_real_raw.values, y_real)
                pred_a = m_full.predict(case_a)[0]
                pred_b = m_full.predict(case_b)[0]
            elif mtype == "et":
                m_full = ExtraTreesRegressor(**params, random_state=RANDOM_STATE).fit(X_real_raw.values, y_real)
                pred_a = m_full.predict(case_a)[0]
                pred_b = m_full.predict(case_b)[0]
            elif mtype == "gbdt":
                m_full = GradientBoostingRegressor(**params, random_state=RANDOM_STATE).fit(X_real_raw.values, y_real)
                pred_a = m_full.predict(case_a)[0]
                pred_b = m_full.predict(case_b)[0]
            elif mtype == "fe_rf":
                m_full = RandomForestRegressor(**params, random_state=RANDOM_STATE).fit(X_real_fe.values, y_real)
                pred_a = m_full.predict(df_case_a_fe.values)[0]
                pred_b = m_full.predict(df_case_b_fe.values)[0]
            elif mtype == "fe_et":
                m_full = ExtraTreesRegressor(**params, random_state=RANDOM_STATE).fit(X_real_fe.values, y_real)
                pred_a = m_full.predict(df_case_a_fe.values)[0]
                pred_b = m_full.predict(df_case_b_fe.values)[0]
            elif mtype == "syn_full_unweighted":
                syn_valid = df_syn[df_syn["Valid_For_Training"] == True]
                X_comb = np.vstack([X_real_raw.values, syn_valid[BASE_FEATURES].values])
                y_comb = np.concatenate([y_real, syn_valid[target.upper()].values])
                m_full = RandomForestRegressor(n_estimators=60, max_depth=6, random_state=RANDOM_STATE).fit(X_comb, y_comb)
                pred_a = m_full.predict(case_a)[0]
                pred_b = m_full.predict(case_b)[0]
            elif mtype.startswith("syn_ratio_"):
                ratio = params["ratio"]
                syn_valid = df_syn[df_syn["Valid_For_Training"] == True]
                X_comb = np.vstack([X_real_raw.values, syn_valid[BASE_FEATURES].values])
                y_comb = np.concatenate([y_real, syn_valid[target.upper()].values])
                w_comb = np.concatenate([np.ones(len(y_real)), np.full(len(syn_valid), (ratio * len(y_real)) / len(syn_valid))])
                m_full = RandomForestRegressor(n_estimators=60, max_depth=5, random_state=RANDOM_STATE).fit(X_comb, y_comb, sample_weight=w_comb)
                pred_a = m_full.predict(case_a)[0]
                pred_b = m_full.predict(case_b)[0]
            else:
                pred_a, pred_b = np.nan, np.nan
                
            err_a_pct = abs(pred_a - target_actual_a) / target_actual_a * 100.0 if pd.notnull(pred_a) else np.nan
            err_b_pct = abs(pred_b - target_actual_b) / target_actual_b * 100.0 if pd.notnull(pred_b) else np.nan
            
            m_metrics = compute_metrics(y_real, oof_preds, is_major_mask)
            
            res_entry = {
                "target": target,
                "model_name": name,
                "case_a_pred": pred_a,
                "case_a_err_pct": err_a_pct,
                "case_b_pred": pred_b,
                "case_b_err_pct": err_b_pct,
                "oof_mae": m_metrics["mae"],
                "oof_rmse": m_metrics["rmse"],
                "oof_r2": m_metrics["r2"],
                "oof_med_ape": m_metrics["med_ape"],
                "oof_pct_within_2": m_metrics["pct_within_2"],
                "oof_pct_within_5": m_metrics["pct_within_5"],
                "oof_pct_within_10": m_metrics["pct_within_10"],
                "oof_max_ape": m_metrics["max_ape"],
                "oof_worst_abs_err": m_metrics["worst_abs_err"],
                "maj_mae": m_metrics["maj_mae"],
                "maj_rmse": m_metrics["maj_rmse"],
                "maj_r2": m_metrics["maj_r2"],
                "maj_med_ape": m_metrics["maj_med_ape"],
                "maj_pct_within_2": m_metrics["maj_pct_within_2"],
                "maj_pct_within_5": m_metrics["maj_pct_within_5"],
            }
            results.append(res_entry)
            print(f"[{target.upper()}] {name:50s} | OOF R2: {m_metrics['r2']:.3f} | Maj R2: {m_metrics['maj_r2']:.3f} | Med APE: {m_metrics['med_ape']:.1f}% | Case A: {err_a_pct:.1f}% | Case B: {err_b_pct:.1f}%")

    res_df = pd.DataFrame(results)
    out_csv = REPORTS_DIR / "comprehensive_model_optimization_results.csv"
    res_df.to_csv(out_csv, index=False)
    print(f"\nSaved comprehensive benchmark to {out_csv}")
    return res_df

if __name__ == "__main__":
    run_comprehensive_benchmark()
