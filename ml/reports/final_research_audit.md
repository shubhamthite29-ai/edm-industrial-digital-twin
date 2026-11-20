# Final Research ML Audit

## Evidence Gate

The user experimental `Data_sheet.csv`, Siddharth Dhobal report, and Swapnil report are excluded. None was used for training, tuning, preprocessing, feature selection, candidate selection, validation, or benchmarks.

## Canonical Targets

- MRR: 114 canonical volumetric `mm3/min` observations (directly reported or documented density-derived).
- TWR: 99 canonical volumetric `mm3/min` observations (directly reported or documented density-derived).
- Quarantined literature targets: 118 (mass-rate or ambiguous/unsupported definitions).
- No EWR/electrode-wear-ratio observation is converted to TWR.

## Primary Model Cohort

- Rows with all selected predictors and MRR: 87.
- Rows with all selected predictors and TWR: 72.
- Source groups: 3.
- Workpieces: Aluminium 6061, Ti-6Al-4V, Waspaloy.
- Electrodes: Aluminium, Brass, Copper, Graphite.
- Features: current_A, voltage_V, ton_us, workpiece_material, electrode_material.
- Material-property reference values are retained for provenance and display only; they are not training features.

## Validation Decision

- Candidate selection used leave-one-source-out diagnostics where trainable, with random split retained only as a diagnostic.
- Selected MRR source-group R2: -1.1042424001106137.
- Selected TWR source-group R2: -1.6717256888470238.
- These source-group results are insufficient to claim cross-paper generalization, high accuracy, or production readiness.
- The browser artifact is exported only as explicitly labelled exploratory research guidance for directly represented combinations and observed process bounds.

## No Synthetic Expansion

No synthetic observations were generated or used.