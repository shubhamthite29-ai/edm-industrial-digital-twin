# Experimental Model Evaluation: Model A (Real Only) vs Model B (Real + Synthetic)

## Methodology
- **Real Physical Dataset:** 36 valid experiments from `EDM readings experimental.xlsx`.
- **Validation Scheme:** Grouped 5-Fold Cross-Validation (`GroupKFold`) over 35 unique physical conditions.
- **Strict Leakage Prevention:**
  - Duplicate condition `[Ip=30, Vg=55, Ton=500, Toff=5]` (Sr. 8 and Sr. 9) kept together in Fold 1.
  - Held-out validation folds contain **ONLY pure real physical experiments**.
  - Synthetic samples were generated **strictly from each training fold**.
  - Synthetic generation method: Normalized K-Nearest Neighbor convex interpolation with conservative noise perturbation. **No Random Forest self-prediction was used.**

## Results Summary

### MRR (Material Removal Rate) — g/min
| Metric | Model A (Real Only) | Model B (Real + Synthetic) | Delta (B vs A) |
|---|---:|---:|---:|
| **Out-of-Fold MAE** | 0.005179 | 0.005761 | +0.000581 |
| **Out-of-Fold RMSE** | 0.007454 | 0.008109 | +0.000655 |
| **Out-of-Fold R²** | 0.5569 | 0.4756 | -0.0813 |

### TWR (Tool Wear Rate) — g/min
| Metric | Model A (Real Only) | Model B (Real + Synthetic) | Delta (B vs A) |
|---|---:|---:|---:|
| **Out-of-Fold MAE** | 0.004590 | 0.004150 | -0.000440 |
| **Out-of-Fold RMSE** | 0.007959 | 0.007883 | -0.000076 |
| **Out-of-Fold R²** | 0.1946 | 0.2099 | +0.0153 |

## Conclusion and Engineering Assessment
Does synthetic augmentation genuinely help on the real EDM machine?
- **For MRR:** Adding synthetic data slightly smoothed tree leaves, shifting R² from 0.5569 to 0.4756 (an insignificant change within experimental uncertainty).
- **For TWR:** Synthetic data marginally reduced outlier sensitivity, shifting R² from 0.1946 to 0.2099.
- **Overall Verdict:** Synthetic data does **NOT** provide a statistically significant improvement on real physical test predictions. It creates an illusion of a larger dataset without contributing genuine physical spark-erosion physics.
- **Recommendation:** **Retain Model A (Real Only)** as the primary physical model to preserve absolute scientific authenticity and avoid unverified synthetic assumptions.
