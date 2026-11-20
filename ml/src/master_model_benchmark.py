"""Master Model Benchmark and Architecture Search for Physical EDM Digital Twin.

Systematically benchmarks candidate model families, data augmentation strategies,
feature engineering, and target transformations on 36 authentic physical EDM experiments
using strictly leak-free GroupKFold cross-validation.
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
from sklearn.gaussian_process.kernels import RBF, Matern, ConstantKernel as C, WhiteKernel
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
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

BASE_FEATURES = ["Ip", "Vg", "Ton", "Toff"]
RANDOM_STATE = 20261012

def engineer_physical_features(df: pd.DataFrame) -> pd.DataFrame:
    """Calculates physically grounded EDM process variables."""
    out = df.copy()
    ip = out["Ip"].astype(float)
    vg = out["Vg"].astype(float)
    ton = out["Ton"].astype(float)
    toff = out["Toff"].astype(float)
    
    period = ton + toff
    duty_cycle = ton / period
    freq = 1e6 / period
    discharge_energy = ip * vg * ton
    avg_power = ip * vg * duty_cycle
    peak_power = ip * vg
    
    out["period"] = period
    out["duty_cycle"] = duty_cycle
    out["freq"] = freq
    out["discharge_energy"] = discharge_energy
    out["avg_power"] = avg_power
    out["peak_power"] = peak_power
    return out

class LogTargetRegressor(BaseEstimator, RegressorMixin):
    def __init__(self, base_estimator):
        self.base_estimator = base_estimator
        self.fitted_estimator = None
        self.offset_ = 0.0
        
    def fit(self, X, y, sample_weight=None):
        self.fitted_estimator = clone(self.base_estimator)
        min_y = np.min(y)
        self.offset_ = 1e-4 if min_y <= 0 else 0.0
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

class BlendedEnsemble(BaseEstimator, RegressorMixin):
    def __init__(self, estimators_weights):
        self.estimators_weights = estimators_weights
        self.fitted_ = []
        
    def fit(self, X, y, sample_weight=None):
        self.fitted_ = []
        for est, w in self.estimators_weights:
            e = clone(est)
            if sample_weight is not None:
                try:
                    e.fit(X, y, sample_weight=sample_weight)
                except TypeError:
                    e.fit(X, y)
            else:
                e.fit(X, y)
            self.fitted_.append((e, w))
        return self
        
    def predict(self, X):
        preds = np.zeros(len(X))
        total_w = sum(w for _, w in self.fitted_)
        for e, w in self.fitted_:
            preds += w * e.predict(X)
        return preds / total_w

def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, is_major_mask: np.ndarray = None):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    
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
        y_true_m = y_true[is_major_mask]
        y_pred_m = y_pred[is_major_mask]
        ape_m = ape[is_major_mask]
        res["maj_mae"] = float(mean_absolute_error(y_true_m, y_pred_m))
        res["maj_rmse"] = float(np.sqrt(mean_squared_error(y_true_m, y_pred_m)))
        res["maj_r2"] = float(r2_score(y_true_m, y_pred_m))
        res["maj_med_ape"] = float(np.median(ape_m))
        res["maj_pct_within_2"] = float(np.mean(ape_m <= 2.0) * 100.0)
        res["maj_pct_within_5"] = float(np.mean(ape_m <= 5.0) * 100.0)
    else:
        res["maj_mae"] = res["mae"]
        res["maj_rmse"] = res["rmse"]
        res["maj_r2"] = res["r2"]
        res["maj_med_ape"] = res["med_ape"]
        res["maj_pct_within_2"] = res["pct_within_2"]
        res["maj_pct_within_5"] = res["pct_within_5"]
        
    return res

def run_benchmarks():
    df_real = pd.read_csv(REAL_CSV)
    df_syn = pd.read_excel(SYNTHETIC_XLSX) if SYNTHETIC_XLSX.exists() else None
    
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
    is_major_mask = ((df_real["Ip"] >= 20) & (df_real["Ton"] >= 200)).values
    
    case_a = np.array([[25.0, 55.0, 400.0, 8.0]])
    case_39 = np.array([[35.0, 40.0, 300.0, 12.0]])
    actual_a_mrr, actual_a_twr = 0.0110, 0.0123
    actual_39_mrr, actual_39_twr = 0.0163, 0.0154
    
    df_case_a = pd.DataFrame([{"Ip": 25.0, "Vg": 55.0, "Ton": 400.0, "Toff": 8.0}])
    df_case_39 = pd.DataFrame([{"Ip": 35.0, "Vg": 40.0, "Ton": 300.0, "Toff": 12.0}])
    
    df_real_fe = engineer_physical_features(df_real)
    fe_cols = ["Ip", "Vg", "Ton", "Toff", "period", "duty_cycle", "discharge_energy", "avg_power"]
    df_case_a_fe = engineer_physical_features(df_case_a)[fe_cols]
    df_case_39_fe = engineer_physical_features(df_case_39)[fe_cols]
    
    # Candidate architectures
    candidates = [
        # 1. Baseline Linear & Kernel Models
        ("Ridge Regression (alpha=1.0)", "ridge", {"alpha": 1.0}),
        ("ElasticNet (alpha=0.01, l1=0.5)", "enet", {"alpha": 0.01, "l1_ratio": 0.5}),
        ("Polynomial Features (deg=2) + Ridge", "poly_ridge", {"alpha": 5.0}),
        ("Support Vector Regression (RBF, C=10)", "svr", {"C": 10.0, "epsilon": 0.001}),
        ("Gaussian Process (ARD RBF + WhiteNoise)", "gpr_rbf", {}),
        ("Gaussian Process (Matern 3/2)", "gpr_matern", {}),
        
        # 2. Tree Models
        ("Pure Random Forest (60 trees, d=5)", "rf", {"n_estimators": 60, "max_depth": 5, "min_samples_leaf": 1}),
        ("Pure Random Forest (100 trees, d=6)", "rf", {"n_estimators": 100, "max_depth": 6, "min_samples_leaf": 1}),
        ("Pure Extra Trees (60 trees, d=5)", "et", {"n_estimators": 60, "max_depth": 5, "min_samples_leaf": 1}),
        ("Pure Extra Trees (60 trees, d=6)", "et", {"n_estimators": 60, "max_depth": 6, "min_samples_leaf": 1}),
        ("Pure Gradient Boosting (40 trees, lr=0.08, d=3)", "gbdt", {"n_estimators": 40, "learning_rate": 0.08, "max_depth": 3}),
        ("Pure Gradient Boosting (60 trees, lr=0.05, d=3)", "gbdt", {"n_estimators": 60, "learning_rate": 0.05, "max_depth": 3}),
        
        # 3. Log-Target Transformations
        ("Log-Target RF (60 trees, d=5)", "log_rf", {"n_estimators": 60, "max_depth": 5}),
        ("Log-Target Extra Trees (60 trees, d=5)", "log_et", {"n_estimators": 60, "max_depth": 5}),
        
        # 4. Feature Engineering
        ("Physical Features + RF (60 trees, d=5)", "fe_rf", {"n_estimators": 60, "max_depth": 5}),
        ("Physical Features + Extra Trees (60 trees, d=5)", "fe_et", {"n_estimators": 60, "max_depth": 5}),
        
        # 5. Synthetic Data Strategies
        ("Augmented v2.1.0 (7735 Synthetic Unweighted)", "syn_all", {}),
        ("Augmented Filtered (Low Uncertainty Sigma_ln < 0.35)", "syn_filtered", {}),
        ("Augmented Weighted (Ratio 10% Synthetic Mass)", "syn_ratio_10", {"ratio": 0.10}),
        ("Augmented Weighted (Ratio 5% Synthetic Mass)", "syn_ratio_5", {"ratio": 0.05}),
        ("Augmented In-Fold GP Surrogate (Zero Leakage)", "syn_infold_gp", {"n_syn": 100}),
        
        # 6. Deployed Ensembles
        ("v2.2.0 Ensemble (42 RF + 18 ET, d=5)", "ens_v22", {}),
        ("v2.3.0 Master Ensemble (MRR: 40 RF + 20 ET d=5 | TWR: 60 ET d=6)", "ens_v23", {}),
    ]
    
    benchmark_results = []
    
    for target in ["mrr", "twr"]:
        y_real = df_real[target].values
        X_real_raw = df_real[BASE_FEATURES].values
        X_real_fe = df_real_fe[fe_cols].values
        
        true_a = actual_a_mrr if target == "mrr" else actual_a_twr
        true_39 = actual_39_mrr if target == "mrr" else actual_39_twr
        
        for name, mtype, params in candidates:
            oof_preds = np.zeros(len(df_real))
            
            for tr_idx, val_idx in splits:
                X_tr, y_tr = X_real_raw[tr_idx], y_real[tr_idx]
                X_val = X_real_raw[val_idx]
                
                X_tr_fe, X_val_fe = X_real_fe[tr_idx], X_real_fe[val_idx]
                
                if mtype == "ridge":
                    p = Pipeline([("s", StandardScaler()), ("m", Ridge(**params))]).fit(X_tr, y_tr)
                    oof_preds[val_idx] = p.predict(X_val)
                elif mtype == "enet":
                    p = Pipeline([("s", StandardScaler()), ("m", ElasticNet(**params))]).fit(X_tr, y_tr)
                    oof_preds[val_idx] = p.predict(X_val)
                elif mtype == "poly_ridge":
                    p = Pipeline([("poly", PolynomialFeatures(degree=2, include_bias=False)), ("s", StandardScaler()), ("m", Ridge(**params))]).fit(X_tr, y_tr)
                    oof_preds[val_idx] = p.predict(X_val)
                elif mtype == "svr":
                    p = Pipeline([("s", StandardScaler()), ("m", SVR(**params))]).fit(X_tr, y_tr)
                    oof_preds[val_idx] = p.predict(X_val)
                elif mtype == "gpr_rbf":
                    kernel = C(1.0, (1e-3, 1e3)) * RBF([10.0, 10.0, 200.0, 4.0], (1e-2, 1e4)) + WhiteKernel(1e-4, (1e-6, 1e-2))
                    p = Pipeline([("s", StandardScaler()), ("m", GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=2, random_state=RANDOM_STATE))]).fit(X_tr, y_tr)
                    oof_preds[val_idx] = p.predict(X_val)
                elif mtype == "gpr_matern":
                    kernel = C(1.0, (1e-3, 1e3)) * Matern(length_scale=[10.0, 10.0, 200.0, 4.0], nu=1.5) + WhiteKernel(1e-4, (1e-6, 1e-2))
                    p = Pipeline([("s", StandardScaler()), ("m", GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=2, random_state=RANDOM_STATE))]).fit(X_tr, y_tr)
                    oof_preds[val_idx] = p.predict(X_val)
                elif mtype == "rf":
                    m = RandomForestRegressor(**params, random_state=RANDOM_STATE).fit(X_tr, y_tr)
                    oof_preds[val_idx] = m.predict(X_val)
                elif mtype == "et":
                    m = ExtraTreesRegressor(**params, random_state=RANDOM_STATE).fit(X_tr, y_tr)
                    oof_preds[val_idx] = m.predict(X_val)
                elif mtype == "gbdt":
                    m = GradientBoostingRegressor(**params, random_state=RANDOM_STATE).fit(X_tr, y_tr)
                    oof_preds[val_idx] = m.predict(X_val)
                elif mtype == "log_rf":
                    m = LogTargetRegressor(RandomForestRegressor(**params, random_state=RANDOM_STATE)).fit(X_tr, y_tr)
                    oof_preds[val_idx] = m.predict(X_val)
                elif mtype == "log_et":
                    m = LogTargetRegressor(ExtraTreesRegressor(**params, random_state=RANDOM_STATE)).fit(X_tr, y_tr)
                    oof_preds[val_idx] = m.predict(X_val)
                elif mtype == "fe_rf":
                    m = RandomForestRegressor(**params, random_state=RANDOM_STATE).fit(X_tr_fe, y_tr)
                    oof_preds[val_idx] = m.predict(X_val_fe)
                elif mtype == "fe_et":
                    m = ExtraTreesRegressor(**params, random_state=RANDOM_STATE).fit(X_tr_fe, y_tr)
                    oof_preds[val_idx] = m.predict(X_val_fe)
                elif mtype == "syn_all":
                    syn_v = df_syn[df_syn["Valid_For_Training"] == True]
                    X_c = np.vstack([X_tr, syn_v[BASE_FEATURES].values])
                    y_c = np.concatenate([y_tr, syn_v[target.upper()].values])
                    m = RandomForestRegressor(n_estimators=60, max_depth=6, random_state=RANDOM_STATE).fit(X_c, y_c)
                    oof_preds[val_idx] = m.predict(X_val)
                elif mtype == "syn_filtered":
                    mask = (df_syn["Valid_For_Training"] == True) & (df_syn[f"{target.upper()}_Sigma_ln"] < 0.35) & (df_syn["Leverage"] < 0.15)
                    syn_f = df_syn[mask]
                    if len(syn_f) > 0:
                        X_c = np.vstack([X_tr, syn_f[BASE_FEATURES].values])
                        y_c = np.concatenate([y_tr, syn_f[target.upper()].values])
                    else:
                        X_c, y_c = X_tr, y_tr
                    m = RandomForestRegressor(n_estimators=60, max_depth=5, random_state=RANDOM_STATE).fit(X_c, y_c)
                    oof_preds[val_idx] = m.predict(X_val)
                elif mtype.startswith("syn_ratio_"):
                    r = params["ratio"]
                    syn_v = df_syn[df_syn["Valid_For_Training"] == True]
                    X_syn = syn_v[BASE_FEATURES].values
                    y_syn = syn_v[target.upper()].values
                    w_real = np.ones(len(X_tr))
                    w_syn = np.full(len(X_syn), (r * len(X_tr)) / len(X_syn))
                    X_c = np.vstack([X_tr, X_syn])
                    y_c = np.concatenate([y_tr, y_syn])
                    w_c = np.concatenate([w_real, w_syn])
                    m = RandomForestRegressor(n_estimators=60, max_depth=5, random_state=RANDOM_STATE).fit(X_c, y_c, sample_weight=w_c)
                    oof_preds[val_idx] = m.predict(X_val)
                elif mtype == "syn_infold_gp":
                    kernel = C(1.0) * RBF([10.0, 10.0, 200.0, 4.0]) + WhiteKernel(1e-4)
                    gp = GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=1, random_state=RANDOM_STATE).fit(X_tr, y_tr)
                    lows, highs = X_tr.min(axis=0), X_tr.max(axis=0)
                    np.random.seed(RANDOM_STATE)
                    X_syn_in = np.random.uniform(lows, highs, size=(params["n_syn"], 4))
                    y_syn_in = gp.predict(X_syn_in)
                    w_real = np.ones(len(X_tr))
                    w_syn = np.full(len(X_syn_in), (0.1 * len(X_tr)) / len(X_syn_in))
                    X_c = np.vstack([X_tr, X_syn_in])
                    y_c = np.concatenate([y_tr, y_syn_in])
                    w_c = np.concatenate([w_real, w_syn])
                    m = RandomForestRegressor(n_estimators=60, max_depth=5, random_state=RANDOM_STATE).fit(X_c, y_c, sample_weight=w_c)
                    oof_preds[val_idx] = m.predict(X_val)
                elif mtype == "ens_v22":
                    rf = RandomForestRegressor(n_estimators=42, max_depth=5, random_state=RANDOM_STATE).fit(X_tr, y_tr)
                    et = ExtraTreesRegressor(n_estimators=18, max_depth=5, random_state=RANDOM_STATE).fit(X_tr, y_tr)
                    oof_preds[val_idx] = (42 * rf.predict(X_val) + 18 * et.predict(X_val)) / 60.0
                elif mtype == "ens_v23":
                    if target == "mrr":
                        rf = RandomForestRegressor(n_estimators=40, max_depth=5, random_state=RANDOM_STATE).fit(X_tr, y_tr)
                        et = ExtraTreesRegressor(n_estimators=20, max_depth=5, random_state=RANDOM_STATE).fit(X_tr, y_tr)
                        oof_preds[val_idx] = (40 * rf.predict(X_val) + 20 * et.predict(X_val)) / 60.0
                    else:
                        et = ExtraTreesRegressor(n_estimators=60, max_depth=6, random_state=RANDOM_STATE).fit(X_tr, y_tr)
                        oof_preds[val_idx] = et.predict(X_val)

            # Fit on full data to assess Case A and Case 39
            if mtype == "ens_v23":
                if target == "mrr":
                    rf_f = RandomForestRegressor(n_estimators=40, max_depth=5, random_state=RANDOM_STATE).fit(X_real_raw, y_real)
                    et_f = ExtraTreesRegressor(n_estimators=20, max_depth=5, random_state=RANDOM_STATE).fit(X_real_raw, y_real)
                    pa = (40 * rf_f.predict(case_a)[0] + 20 * et_f.predict(case_a)[0]) / 60.0
                    p39 = (40 * rf_f.predict(case_39)[0] + 20 * et_f.predict(case_39)[0]) / 60.0
                else:
                    et_f = ExtraTreesRegressor(n_estimators=60, max_depth=6, random_state=RANDOM_STATE).fit(X_real_raw, y_real)
                    pa = et_f.predict(case_a)[0]
                    p39 = et_f.predict(case_39)[0]
            elif mtype == "ens_v22":
                rf_f = RandomForestRegressor(n_estimators=42, max_depth=5, random_state=RANDOM_STATE).fit(X_real_raw, y_real)
                et_f = ExtraTreesRegressor(n_estimators=18, max_depth=5, random_state=RANDOM_STATE).fit(X_real_raw, y_real)
                pa = (42 * rf_f.predict(case_a)[0] + 18 * et_f.predict(case_a)[0]) / 60.0
                p39 = (42 * rf_f.predict(case_39)[0] + 18 * et_f.predict(case_39)[0]) / 60.0
            elif mtype == "rf":
                m_f = RandomForestRegressor(**params, random_state=RANDOM_STATE).fit(X_real_raw, y_real)
                pa, p39 = m_f.predict(case_a)[0], m_f.predict(case_39)[0]
            elif mtype == "et":
                m_f = ExtraTreesRegressor(**params, random_state=RANDOM_STATE).fit(X_real_raw, y_real)
                pa, p39 = m_f.predict(case_a)[0], m_f.predict(case_39)[0]
            elif mtype == "gbdt":
                m_f = GradientBoostingRegressor(**params, random_state=RANDOM_STATE).fit(X_real_raw, y_real)
                pa, p39 = m_f.predict(case_a)[0], m_f.predict(case_39)[0]
            elif mtype == "fe_rf":
                m_f = RandomForestRegressor(**params, random_state=RANDOM_STATE).fit(X_real_fe, y_real)
                pa, p39 = m_f.predict(df_case_a_fe.values)[0], m_f.predict(df_case_39_fe.values)[0]
            elif mtype == "fe_et":
                m_f = ExtraTreesRegressor(**params, random_state=RANDOM_STATE).fit(X_real_fe, y_real)
                pa, p39 = m_f.predict(df_case_a_fe.values)[0], m_f.predict(df_case_39_fe.values)[0]
            elif mtype == "syn_all":
                syn_v = df_syn[df_syn["Valid_For_Training"] == True]
                X_c = np.vstack([X_real_raw, syn_v[BASE_FEATURES].values])
                y_c = np.concatenate([y_real, syn_v[target.upper()].values])
                m_f = RandomForestRegressor(n_estimators=60, max_depth=6, random_state=RANDOM_STATE).fit(X_c, y_c)
                pa, p39 = m_f.predict(case_a)[0], m_f.predict(case_39)[0]
            elif mtype.startswith("syn_ratio_"):
                r = params["ratio"]
                syn_v = df_syn[df_syn["Valid_For_Training"] == True]
                X_syn = syn_v[BASE_FEATURES].values
                y_syn = syn_v[target.upper()].values
                w_c = np.concatenate([np.ones(len(X_real_raw)), np.full(len(X_syn), (r * len(X_real_raw)) / len(X_syn))])
                X_c = np.vstack([X_real_raw, X_syn])
                y_c = np.concatenate([y_real, y_syn])
                m_f = RandomForestRegressor(n_estimators=60, max_depth=5, random_state=RANDOM_STATE).fit(X_c, y_c, sample_weight=w_c)
                pa, p39 = m_f.predict(case_a)[0], m_f.predict(case_39)[0]
            else:
                pa, p39 = np.nan, np.nan
                
            err_a = abs(pa - true_a) / true_a * 100.0 if pd.notnull(pa) else np.nan
            err_39 = abs(p39 - true_39) / true_39 * 100.0 if pd.notnull(p39) else np.nan
            
            m_metrics = compute_metrics(y_real, oof_preds, is_major_mask)
            
            row = {
                "target": target,
                "model_name": name,
                "case_a_pred": pa,
                "case_a_err_pct": err_a,
                "case_39_pred": p39,
                "case_39_err_pct": err_39,
                "oof_mae": m_metrics["mae"],
                "oof_rmse": m_metrics["rmse"],
                "oof_r2": m_metrics["r2"],
                "oof_med_ape": m_metrics["med_ape"],
                "oof_mean_ape": m_metrics["mean_ape"],
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
            benchmark_results.append(row)
            print(f"[{target.upper()}] {name:50s} | OOF R2: {m_metrics['r2']:.3f} | Maj R2: {m_metrics['maj_r2']:.3f} | MedAPE: {m_metrics['med_ape']:.1f}% | Case A: {err_a:.1f}% | Case 39: {err_39:.1f}%")

    res_df = pd.DataFrame(benchmark_results)
    out_csv = REPORTS_DIR / "candidate_model_comparisons_and_data_strategies.csv"
    res_df.to_csv(out_csv, index=False)
    print(f"\nSaved master benchmark to {out_csv}")
    return res_df

if __name__ == "__main__":
    run_benchmarks()
