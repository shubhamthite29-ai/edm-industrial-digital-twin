import openpyxl
import pandas as pd
import numpy as np
from pathlib import Path

xlsx_path = Path(r"c:\Users\ShubhamShaurya\Documents\Codex\2026-07-05\absolutely-below-is-a-single-master-2\ml\data\physical_experiments\EDM readings experimental.xlsx")

wb = openpyxl.load_workbook(xlsx_path, data_only=False)
print("=== SHEETS IN WORKBOOK ===")
print(wb.sheetnames)

for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    print(f"\n================ SHEET: {sheet_name} ================")
    print(f"Dimensions: {ws.dimensions}, max_row: {ws.max_row}, max_column: {ws.max_column}")
    
    # Read raw cells including formulas
    rows_formula = list(ws.iter_rows(values_only=False))
    
    # Read with pandas (values only)
    df = pd.read_excel(xlsx_path, sheet_name=sheet_name)
    print("\nColumns detected by pandas:")
    print(df.columns.tolist())
    print("\nShape:", df.shape)
    print("\nHead (up to 15 rows):")
    print(df.head(15))
    
    print("\nNull counts per column:")
    print(df.isna().sum())
    
    print("\nTail (last 10 rows):")
    print(df.tail(10))
