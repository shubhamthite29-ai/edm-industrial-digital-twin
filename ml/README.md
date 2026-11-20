# Shailesh-Sir Single-Source EDM ML Pipeline

The active EDM ML artifact is built only from `C:\Users\ShubhamShaurya\Downloads\files.zip`:

- `real_experimental.csv`: 32 Table 4 observations from Shirguppikar et al. (2021).
- `synthetic_augmented.csv`: 10,000 supplied Shailesh-Sir-derived augmentation rows.

No historical literature CSV, prior 84/99-row dataset, Siddharth or Swapnil material, `Data_sheet.csv`, unrelated source, or old model artifact is an active input. User experimental CSV files are evaluation-only and never retrain the bundled model.

## Active contract

- Workpiece: Ti-6Al-4V only.
- Electrode: Aluminium (Al) only.
- Coatings: Uncoated and AlCrNi (PVD).
- Features: Current_A, Voltage_V, TON_us, Electrode_Coating.
- Models: independently trained Random Forest regressors for MRR and TWR.
- Responses: source-reported `g/min`, not `mm3/min`.

The source paper reports direct Table 4 response values and defines `MRR = (Wi - Wf) / t` and `TWR = (Ti - Tf) / t`, both in g/min. Its missing aluminium-electrode density makes a TWR volume conversion indefensible, so the dashboard intentionally preserves `g/min`.

## Rebuild

```powershell
& "C:\Users\ShubhamShaurya\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" ml\src\build_shailesh_single_source_model.py
```

The script emits source-separated datasets under `ml/data/shailesh_sir`, the report under `ml/reports/ML_MODEL_REPORT.md`, and the active browser tree ensemble under `src/data/ml/frozen-research-model.json`.

## Verification

```powershell
node ml/tests/browser_artifact_check.mjs
& "C:\Users\ShubhamShaurya\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m unittest ml.tests.test_ml_engine
```

The browser test executes the exported trees for 20 representative source-derived cases and compares them with the Python export values.
