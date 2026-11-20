import openpyxl
from pathlib import Path

xlsx_path = Path(r"c:\Users\ShubhamShaurya\Documents\Codex\2026-07-05\absolutely-below-is-a-single-master-2\ml\data\physical_experiments\EDM readings experimental.xlsx")

wb = openpyxl.load_workbook(xlsx_path, data_only=False)
ws = wb["Workpiece"]

print(f"Max row: {ws.max_row}, Max col: {ws.max_column}")

for r in range(1, ws.max_row + 1):
    row_vals = [ws.cell(r, c).value for c in range(1, ws.max_column + 1)]
    # if not all None
    if any(v is not None for v in row_vals):
        print(f"Row {r:2d}: {row_vals}")
