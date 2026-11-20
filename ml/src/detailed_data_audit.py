import openpyxl
import pandas as pd
import numpy as np

xlsx_path = r"c:\Users\ShubhamShaurya\Documents\Codex\2026-07-05\absolutely-below-is-a-single-master-2\ml\data\physical_experiments\EDM readings experimental.xlsx"

wb = openpyxl.load_workbook(xlsx_path, data_only=True)
ws = wb["Workpiece"]

rows_data = []
for r in range(1, ws.max_row + 1):
    vals = [ws.cell(r, c).value for c in range(1, ws.max_column + 1)]
    rows_data.append(vals)

header = rows_data[0]
meta_row = rows_data[1]
data_rows = rows_data[2:]

df = pd.DataFrame(data_rows, columns=header)
print("=== RAW LOADED DATAFRAME ===")
print(df)

# Check row 20 (Sr no 17)
# Let's see: row 20 has Weight before: 218.226, Weight after: 218.245!
# 218.245 > 218.226! Workpiece weight increased by 0.019 g!
# Resulting in negative MRR: (218.226 - 218.245)/10 = -0.0019!

print("\n=== AUDITING EACH ROW ===")
for idx, row in df.iterrows():
    sr = row['Sr no.']
    w_b = row['Weight of workpiece Before machining']
    w_a = row['Weight of workpiece after machining']
    ip = row['Ip']
    vg = row['Vg']
    ton = row['Ton']
    toff = row['t']
    t_b = row['Weight of tool before mactioning']
    t_a = row['Weight of tool after mactioning']
    doc = row['Depth of cut']
    m_time = row['machining time']
    mrr = row['MRR']
    twr = row['TWR']
    
    # Calculate MRR and TWR manually
    calc_mrr = (w_b - w_a) / m_time if (w_b is not None and w_a is not None and m_time) else None
    calc_twr = (t_b - t_a) / m_time if (t_b is not None and t_a is not None and m_time) else None
    
    issues = []
    if sr == ' test' or str(sr).strip() == 'test':
        issues.append("TEST_ROW")
    if w_b is None and w_a is None and mrr is None:
        issues.append("INPUT_ONLY_CANDIDATE_ROW")
    if w_b is not None and w_a is not None and w_a > w_b:
        issues.append(f"WORKPIECE_MASS_INCREASE (before={w_b}, after={w_a}, delta={w_a-w_b:.4f})")
    if t_b is not None and t_a is not None and t_a > t_b:
        issues.append(f"TOOL_MASS_INCREASE (before={t_b}, after={t_a}, delta={t_a-t_b:.4f})")
    if mrr is not None and mrr < 0:
        issues.append(f"NEGATIVE_MRR ({mrr})")
    if twr is not None and twr < 0:
        issues.append(f"NEGATIVE_TWR ({twr})")
    if twr == 0:
        issues.append(f"ZERO_TWR ({twr})")
        
    print(f"Row {idx+3:2d} | Sr: {str(sr):>5} | Ip={ip:>2}, Vg={vg:>2}, Ton={ton:>4}, Toff={toff} | W_delta={((w_b-w_a) if w_b and w_a else None)} | Time={m_time} | MRR={mrr} | TWR={twr} | Issues: {', '.join(issues) if issues else 'OK'}")
