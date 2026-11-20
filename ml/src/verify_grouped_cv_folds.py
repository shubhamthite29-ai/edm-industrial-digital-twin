import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestRegressor
from sklearn.dummy import DummyRegressor
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = Path(r"c:\Users\ShubhamShaurya\Documents\Codex\2026-07-05\absolutely-below-is-a-single-master-2")
CLEAN_CSV = ROOT / "ml" / "data" / "physical_experiments" / "clean_physical_experiments.csv"

df = pd.read_csv(CLEAN_CSV)
features = ["Ip", "Vg", "Ton", "Toff"]
X = df[features].to_numpy(dtype=float)
y_mrr = df["mrr"].to_numpy(dtype=float)
y_twr = df["twr"].to_numpy(dtype=float)

# 1. Unique conditions analysis
unique_conditions, groups = np.unique(X, axis=0, return_inverse=True)
num_samples = len(X)
num_unique = len(unique_conditions)

print("=== 1. UNIQUE CONDITIONS & DUPLICATE ANALYSIS ===")
print(f"Total physical experimental records: {num_samples}")
print(f"Actual unique [Ip, Vg, Ton, Toff] feature conditions: {num_unique}")

# Find duplicate rows
condition_counts = pd.Series(groups).value_counts()
dup_group_ids = condition_counts[condition_counts > 1].index.tolist()
print(f"Number of duplicate conditions: {len(dup_group_ids)}")

for gid in dup_group_ids:
    dup_indices = np.flatnonzero(groups == gid)
    dup_rows = df.iloc[dup_indices]
    cond_vals = unique_conditions[gid]
    print(f"Duplicate Condition [Ip={cond_vals[0]}, Vg={cond_vals[1]}, Ton={cond_vals[2]}, Toff={cond_vals[3]}]:")
    for _, r in dup_rows.iterrows():
        print(f"  - Sr. No. {int(r['sr_no'])}: MRR={r['mrr']:.4f} g/min, TWR={r['twr']:.4f} g/min, Machining Time={r['time']} min")

# 2. GroupKFold Verification
gkf = GroupKFold(n_splits=5)
splits = list(gkf.split(X, y_mrr, groups=groups))

print("\n=== 2. GROUPED CROSS-VALIDATION FOLD COMPOSITION ===")
fold_assignments = np.zeros(num_samples, dtype=int)
for fold_idx, (train_idx, val_idx) in enumerate(splits):
    fold_assignments[val_idx] = fold_idx + 1
    val_groups = set(groups[val_idx])
    train_groups = set(groups[train_idx])
    overlap = val_groups.intersection(train_groups)
    print(f"Fold {fold_idx + 1}: Train={len(train_idx)} samples ({len(train_groups)} unique conditions), "
          f"Validation={len(val_idx)} samples ({len(val_groups)} unique conditions), "
          f"Group Overlap={len(overlap)} ({'NO LEAKAGE' if len(overlap) == 0 else 'LEAK DETECTED!'})")

# Specifically check that Sr. 8 and Sr. 9 are in the same fold
sr8_fold = fold_assignments[df["sr_no"] == 8][0]
sr9_fold = fold_assignments[df["sr_no"] == 9][0]
print(f"\nVerification of duplicate pair Sr. 8 & Sr. 9:")
print(f"  Sr. 8 assigned to Fold: {sr8_fold}")
print(f"  Sr. 9 assigned to Fold: {sr9_fold}")
assert sr8_fold == sr9_fold, "Sr. 8 and Sr. 9 must be in the exact same fold!"
print("  -> CONFIRMED: Duplicate feature conditions cannot leak across training and validation folds.")

# 3. Fold-level results for MRR and TWR
for target_name, y in [("MRR (g/min)", y_mrr), ("TWR (g/min)", y_twr)]:
    print(f"\n=== 3. FOLD-LEVEL RESULTS FOR {target_name} ===")
    oof_rf = np.zeros(num_samples)
    oof_base = np.zeros(num_samples)
    
    print(f"{'Fold':<6} | {'Val Size':<8} | {'RF MAE':<10} | {'RF RMSE':<10} | {'RF R2':<10} | {'Base MAE':<10} | {'Base R2':<10}")
    print("-" * 75)
    
    for fold_idx, (train_idx, val_idx) in enumerate(splits):
        # Baseline
        base = DummyRegressor(strategy="mean")
        base.fit(X[train_idx], y[train_idx])
        p_base = base.predict(X[val_idx])
        oof_base[val_idx] = p_base
        
        # Random Forest
        rf = RandomForestRegressor(n_estimators=50, max_depth=5, min_samples_leaf=2, max_features=3, random_state=42)
        rf.fit(X[train_idx], y[train_idx])
        p_rf = rf.predict(X[val_idx])
        oof_rf[val_idx] = p_rf
        
        f_rf_mae = mean_absolute_error(y[val_idx], p_rf)
        f_rf_rmse = np.sqrt(mean_squared_error(y[val_idx], p_rf))
        f_rf_r2 = r2_score(y[val_idx], p_rf) if np.var(y[val_idx]) > 1e-12 else np.nan
        
        f_b_mae = mean_absolute_error(y[val_idx], p_base)
        f_b_r2 = r2_score(y[val_idx], p_base) if np.var(y[val_idx]) > 1e-12 else np.nan
        
        print(f"Fold {fold_idx + 1:<2} | {len(val_idx):<8} | {f_rf_mae:.6f}   | {f_rf_rmse:.6f}   | {f_rf_r2:.4f}     | {f_b_mae:.6f}   | {f_b_r2:.4f}")
    
    # Overall Out-of-fold metrics
    tot_rf_mae = mean_absolute_error(y, oof_rf)
    tot_rf_rmse = np.sqrt(mean_squared_error(y, oof_rf))
    tot_rf_r2 = r2_score(y, oof_rf)
    tot_b_mae = mean_absolute_error(y, oof_base)
    tot_b_r2 = r2_score(y, oof_base)
    
    print("-" * 75)
    print(f"Overall Out-of-Fold Random Forest: MAE={tot_rf_mae:.6f}, RMSE={tot_rf_rmse:.6f}, R2={tot_rf_r2:.4f}")
    print(f"Overall Out-of-Fold Baseline:      MAE={tot_b_mae:.6f}, RMSE={np.sqrt(mean_squared_error(y, oof_base)):.6f}, R2={tot_b_r2:.4f}")
