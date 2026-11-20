# Shailesh-Sir Single-Source EDM Random Forest Model

## Scope and provenance

This is the active EDM ML pipeline. It reads **only** `files.zip` (SHA-256 `ec8ae08473eaacaff22284824a4190d41f6db19204bf5e94efdcad893b1f47a4`), specifically `real_experimental.csv` and `synthetic_augmented.csv`. Historical datasets, user experimental data, other papers, old artifacts, and old formulas are not inputs.

- Source paper: Assessing the Effects of Uncoated and Coated Electrode on Response Variables in Electrical Discharge Machining for Ti-6Al-4V Titanium Alloy (2021), DOI `10.24874/ti.1020.12.20.03`.
- Source responses: direct Table 4 MRR and TWR values.
- Source methodology: `MRR (g/min) = (Wi - Wf) / t`; `TWR (g/min) = (Ti - Tf) / t`.
- Raw masses and machining times are not reported, so direct table values are preserved exactly. No alternate formula is applied.

## Dataset

| Item | Count/value |
|---|---:|
| Real experimental rows | 32 |
| Synthetic augmented rows | 10000 |
| Final training rows | 10032 |
| Papers | 1 |
| Workpieces | Ti-6Al-4V |
| Electrode base materials | Aluminium (Al) |
| Coating conditions | AlCrNi (PVD), Uncoated |
| Features | Current_A, Voltage_V, TON_us, Electrode_Coating |

`Rotation`, TOFF, duty cycle, dielectric, and every unsupported material/property are excluded from the active model.

## Units

Both target columns are **g/min**, exactly as Table 4 reports them. Ti-6Al-4V density is reported as 4.43 g/cm3, but the paper does not provide the aluminium-electrode density needed to convert TWR to volume. Therefore neither response is relabelled as mm3/min and no unsupported conversion is made.

## Model and validation

- Model: Random Forest regression, 80 weighted-bootstrap trees, max depth 8, randomized three-feature split selection, and all four dataset-supported features.
- Real-data priority: real observations receive a training weight of 300; synthetic augmentation receives 1.
- Generalization: 4-fold coating-stratified validation over 32 real observations only. Synthetic augmentation is excluded from all held-out folds.
- Paper match: final model evaluated against all 32 real rows. This is a source-fidelity/in-sample check, not generalization evidence.

| Target | Generalization MAE | Generalization RMSE | Generalization R2 | Paper mean error % | Paper maximum error % |
|---|---:|---:|---:|---:|---:|
| MRR (g/min) | 0.00308397 | 0.00397552 | 0.53764 | 0.68313 | 5.53193 |
| TWR (g/min) | 0.00197718 | 0.00253028 | 0.75937 | 0.02128 | 0.25132 |

The paper-match tolerance is `0.00015 g/min` (1.5 times the source table's `0.0001 g/min` display resolution), applied to both targets. `32/32` rows meet both absolute-error limits. This threshold is a table-resolution fidelity gate, not a claim about external prediction accuracy.

## Browser parity

20 source-derived cases were evaluated through the exported tree ensemble. Maximum Python/browser difference: MRR `0` g/min; TWR `0` g/min.

## Files

- `ml/data/shailesh_sir/REAL_EXPERIMENTAL.csv`
- `ml/data/shailesh_sir/SYNTHETIC_AUGMENTED.csv`
- `ml/data/shailesh_sir/FINAL_TRAINING_DATA.csv`
- `ml/data/shailesh_sir/PAPER_MATCH_VALIDATION.csv`
- `ml/reports/MODEL_RESULTS.csv`
- `ml/reports/FEATURE_IMPORTANCE.csv`
- `src/data/ml/frozen-research-model.json`
