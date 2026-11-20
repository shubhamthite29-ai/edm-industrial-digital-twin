import openpyxl
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.dummy import DummyRegressor
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

xlsx = r"c:\Users\ShubhamShaurya\Documents\Codex\2026-07-05\absolutely-below-is-a-single-master-2\ml\data\physical_experiments\EDM readings experimental.xlsx"
wb = openpyxl.load_workbook(xlsx, data_only=True)
ws = wb["Workpiece"]

data = []
for r in range(3, 41):
    vals = [ws.cell(r, c).value for c in range(1, 14)]
    data.append(vals)

cols = ["sr_no", "w_wb", "w_wa", "Ip", "Vg", "Ton", "Toff", "w_tb", "w_ta", "doc", "time", "mrr", "twr"]
df = pd.DataFrame(data, columns=cols)

for c in ["Ip", "Vg", "Ton", "Toff", "w_wb", "w_wa", "w_tb", "w_ta", "doc", "time", "mrr", "twr"]:
    df[c] = pd.to_numeric(df[c], errors="coerce")

# Filter valid 36 rows
valid = df[(df["sr_no"] != " test") & (df["mrr"] > 0) & (df["twr"] > 0)].copy()

features = ["Ip", "Vg", "Ton", "Toff"]
X = valid[features].to_numpy(dtype=float)
y_mrr = valid["mrr"].to_numpy(dtype=float)
y_twr = valid["twr"].to_numpy(dtype=float)

# Create group labels for GroupKFold to prevent duplicate leakage
unique_conditions, groups = np.unique(X, axis=0, return_inverse=True)
print(f"Total valid samples: {len(X)}, Unique feature conditions: {len(unique_conditions)}")

gkf = GroupKFold(n_splits=5)

for target_name, y in [("MRR (g/min)", y_mrr), ("TWR (g/min)", y_twr)]:
    print(f"\n================ EVALUATING {target_name} ================")
    # 1. Baseline: Dummy Regressor (predicts mean of training set)
    baseline_preds = np.zeros(len(y))
    for train_idx, test_idx in gkf.split(X, y, groups=groups):
        dummy = DummyRegressor(strategy="mean")
        dummy.fit(X[train_idx], y[train_idx])
        baseline_preds[test_idx] = dummy.predict(X[test_idx])
    
    b_mae = mean_absolute_error(y, baseline_preds)
    b_rmse = np.sqrt(mean_squared_error(y, baseline_preds))
    b_r2 = r2_score(y, baseline_preds)
    b_mape = np.mean(np.abs((y - baseline_preds) / y)) * 100
    print(f"Baseline (Mean Predictor): MAE={b_mae:.6f}, RMSE={b_rmse:.6f}, R2={b_r2:.4f}, MAPE={b_mape:.2f}%")

    # 2. Random Forest Regressor
    rf_preds = np.zeros(len(y))
    for train_idx, test_idx in gkf.split(X, y, groups=groups):
        rf = RandomForestRegressor(n_estimators=50, max_depth=5, min_samples_leaf=2, max_features=3, random_state=42)
        rf.fit(X[train_idx], y[train_idx])
        rf_preds[test_idx] = rf.predict(X[test_idx])
    
    rf_mae = mean_absolute_error(y, rf_preds)
    rf_rmse = np.sqrt(mean_squared_error(y, rf_preds))
    rf_r2 = r2_score(y, rf_preds)
    rf_mape = np.mean(np.abs((y - rf_preds) / y)) * 100
    print(f"Random Forest (Grouped 5-Fold CV): MAE={rf_mae:.6f}, RMSE={rf_rmse:.6f}, R2={rf_r2:.4f}, MAPE={rf_mape:.2f}%")
