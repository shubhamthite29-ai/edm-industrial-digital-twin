import openpyxl
import pandas as pd
import numpy as np
from pathlib import Path

ROOT = Path(r"c:\Users\ShubhamShaurya\Documents\Codex\2026-07-05\absolutely-below-is-a-single-master-2")
XLSX_PATH = ROOT / "ml" / "data" / "physical_experiments" / "EDM readings experimental.xlsx"
CLEAN_CSV_PATH = ROOT / "ml" / "data" / "physical_experiments" / "clean_physical_experiments.csv"
FLAGGED_CSV_PATH = ROOT / "ml" / "data" / "physical_experiments" / "flagged_anomalous_experiments.csv"
CANDIDATE_CSV_PATH = ROOT / "ml" / "data" / "physical_experiments" / "unrun_candidate_conditions.csv"

# 1. Load CSV
clean_df = pd.read_csv(CLEAN_CSV_PATH)
flagged_df = pd.read_csv(FLAGGED_CSV_PATH)
candidate_df = pd.read_csv(CANDIDATE_CSV_PATH)

print(f"Clean CSV row count: {len(clean_df)}")
print(f"Flagged CSV row count: {len(flagged_df)}")
print(f"Candidate CSV row count: {len(candidate_df)}")

# Check Sr. No. 17 and test
print("\nFlagged rows sr_no:")
print(flagged_df[["sr_no", "Ip", "Vg", "Ton", "Toff", "w_wb", "w_wa", "mrr", "twr"]])

assert 17 in pd.to_numeric(flagged_df["sr_no"], errors="coerce").values, "Sr. No. 17 must be in flagged_df"
assert "test" in flagged_df["sr_no"].astype(str).str.strip().values, "Sr. No. ' test' must be in flagged_df"
assert 17 not in pd.to_numeric(clean_df["sr_no"], errors="coerce").values, "Sr. No. 17 must NOT be in clean_df"

# 2. Load Excel
wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
ws = wb["Workpiece"]

# Collect clean rows directly from Excel
excel_clean_rows = []
excel_flagged_rows = []
excel_candidate_rows = []

for r in range(3, ws.max_row + 1):
    vals = [ws.cell(r, c).value for c in range(1, 14)]
    sr, w_wb, w_wa, ip, vg, ton, toff, w_tb, w_ta, doc, time, mrr, twr = vals
    if w_wb is None and mrr is None:
        excel_candidate_rows.append(vals)
    elif str(sr).strip() == "test" or (mrr is not None and mrr <= 0) or (twr is not None and twr <= 0):
        excel_flagged_rows.append(vals)
    else:
        excel_clean_rows.append(vals)

print(f"\nExcel clean rows count: {len(excel_clean_rows)}")
print(f"Excel flagged rows count: {len(excel_flagged_rows)}")
print(f"Excel candidate rows count: {len(excel_candidate_rows)}")

assert len(excel_clean_rows) == 36, "Excel must have exactly 36 clean rows"
assert len(excel_flagged_rows) == 2, "Excel must have exactly 2 flagged rows"
assert len(excel_candidate_rows) == 4, "Excel must have exactly 4 candidate rows"

# 3. Verify each clean row matches Excel cell-by-cell
mismatches = []
cols = ["sr_no", "w_wb", "w_wa", "Ip", "Vg", "Ton", "Toff", "w_tb", "w_ta", "doc", "time", "mrr", "twr"]
excel_clean_df = pd.DataFrame(excel_clean_rows, columns=cols)

for c in cols:
    clean_df[c] = pd.to_numeric(clean_df[c], errors="coerce")
    excel_clean_df[c] = pd.to_numeric(excel_clean_df[c], errors="coerce")

for i in range(len(clean_df)):
    for col in cols:
        v_csv = clean_df.iloc[i][col]
        v_xl = excel_clean_df.iloc[i][col]
        if isinstance(v_csv, float) or isinstance(v_xl, float):
            if not np.isclose(float(v_csv), float(v_xl), rtol=1e-5, atol=1e-5):
                mismatches.append((i, col, v_csv, v_xl))
        else:
            if v_csv != v_xl:
                mismatches.append((i, col, v_csv, v_xl))

if mismatches:
    print(f"Found {len(mismatches)} mismatches:")
    for m in mismatches:
        print(f"  Row {m[0]}, Col {m[1]}: CSV={m[2]} vs XL={m[3]}")
else:
    print("\nSUCCESS: All 36 clean records in CSV perfectly match the authoritative Excel cells!")
