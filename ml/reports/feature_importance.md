# Feature Importance

For the selected linear/ridge-family models, standardized coefficient magnitude is reported as a diagnostic. This is not SHAP and must not be interpreted as physical causality.

Tree-model feature importance and SHAP were not run because scikit-learn/xgboost/shap are not installed in the local runtime.

## MRR Top Coefficients

- workpiece_material=Aluminium 6061: 102.5
- workpiece_material=Waspaloy: 42.39
- electrode_material=Graphite: 24.71
- electrode_material=Copper: 22.59
- electrode_material=Aluminium: 20.18
- workpiece_material=Ti-6Al-4V: 20.18
- electrode_material=Brass: 12.8
- current_A: 3.548
- ton_us: 0.6199
- voltage_V: 0.1889

## TWR Top Coefficients

- electrode_material=Brass: 29.83
- electrode_material=Graphite: 13.16
- electrode_material=Copper: 11.84
- workpiece_material=Waspaloy: 6.841
- workpiece_material=Ti-6Al-4V: 4.821
- electrode_material=Aluminium: 4.821
- current_A: 4.423
- ton_us: 3.292
- voltage_V: 2.886
- workpiece_material=Aluminium 6061: 2.021