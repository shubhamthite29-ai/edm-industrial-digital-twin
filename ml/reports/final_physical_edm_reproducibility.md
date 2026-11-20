# EDM Digital Twin ML Reproducibility & Audit Specification

**Project:** Design and Development of Digital Twin of Electro Discharge Machining Process for Machining of Aerospace Materials  
**Institution:** Rajarambapu Institute of Technology, Rajaramnagar (Department of Mechatronics Engineering)  
**Authors / Research Team:** Shubham Vishal Thite, Samarth Jaykar Gavade, Shreyash Arvind Mali  
**Faculty Guide:** Dr. Shailesh Shirguppikar  
**Machine:** ELEKTRA PULS S-50 ZNC Die-Sinker EDM  
**Report Generated:** October 15, 2026  
**Document Classification:** Official Academic & Patent Reproducibility Record  

---

## 1. System & Environment Specifications

| Environment Parameter | Value / Version |
| :--- | :--- |
| **Operating System** | Windows 11 Enterprise (x86_64) |
| **Python Runtime** | Python 3.12.10 |
| **Package Manager** | pip / uv |
| **Scikit-Learn** | 1.6.1 |
| **NumPy** | 1.26.4 / 2.x compatible |
| **Pandas** | 2.2.3 |
| **Matplotlib** | 3.10.0 |
| **Node.js / npm** | Node v20.x / npm v10.x |
| **Vite / TypeScript** | Vite v6.4.3 / TypeScript v5.7.3 |

---

## 2. Authoritative Data Hashes & Provenance

| Data File | File Path | SHA-256 Checksum | Size |
| :--- | :--- | :--- | :---: |
| **Authoritative Excel Workbook** | `ml/data/physical_experiments/EDM readings experimental (1).xlsx` | `1d314cd81c8bd906ee7c7a03f5b93d7e5ddc384421624ab1b40d8dc683b9fef3` | 15,803 bytes |
| **Canonical Clean CSV** | `ml/data/physical_experiments/clean_physical_experiments.csv` | `3f06f43d2eb0055b77f67d8f51285df28f70329d4f9790ead9c5fdaecd00b2f0` | 3,531 bytes |
| **Synthetic EDM Dataset (10k)** | `C:\Users\ShubhamShaurya\Desktop\EDM_Digital_Twin_Master_Files\EDM_synthetic_10000.xlsx` | Verified Physics-Augmentation Reference | 1,313,422 bytes |

### 2.1 Audit & Row Reconciliation
- **Total Ingested Rows:** 52 rows in sheet `Workpiece`.
- **Row `Sr no. test`:** Excluded (Pilot machine warm-up run without recorded tool measurements; TWR=0).
- **Row `Sr no. 17`:** Excluded (Pyrolytic carbon black deposition at $I_p=10\text{ A}, V_g=50\text{ V}, T_{on}=1000\text{ }\mu\text{s}, T_{off}=12\text{ }\mu\text{s}$ yielding anomalous negative MRR $-0.0019$ g/min).
- **Canonical Training Rows:** Exactly **48 authentic physical cuts** (Sr. No. 1 to 49, excluding pilot test and 17). Monotonic workpiece weight loss from 221.503 g to 214.270 g confirms continuous physical machining integrity.

---

## 3. Model Architecture, Split Strategy, and Random Seeds

### 3.1 Hyperparameters
- **Estimator Family:** `sklearn.ensemble.ExtraTreesRegressor`
- **Number of Estimators ($N$):** `60`
- **Maximum Tree Depth:** `10`
- **Minimum Samples Split:** `2`
- **Minimum Samples Leaf:** `1`
- **Max Features:** `1.0` (all 4 inputs evaluated at every split)
- **Random Seed / State:** `174` (fixed across all training and cross-validation folds)
- **Input Features:** `["Ip", "Vg", "Ton", "Toff"]` (strictly in this logical order)
- **Target Outputs:** `MRR` (Material Removal Rate, g/min) and `TWR` (Tool Wear Rate, g/min)

### 3.2 Cross-Validation Split Strategy
- **Method:** `sklearn.model_selection.GroupKFold(n_splits=5)`
- **Grouping Key:** Compound string `f"{Ip}_{Vg}_{Ton}_{Toff}"`
- **Leak-Free Guarantee:** All duplicate operating conditions are held in the exact same fold (e.g., Sr. 8 and Sr. 9 are both assigned to Fold 0; Sr. 45 and Sr. 49 are both assigned to Fold 1). No test condition has an identical dial pair in its training fold.

---

## 4. Production Artifact Integrity & Mode A Safety

| Artifact | File Path | SHA-256 Checksum | Safety Status |
| :--- | :--- | :--- | :---: |
| **Deployed Production Artifact (Frontend)** | `src/data/ml/physical-experimental-model.json` | `889c93f14827ab901f2cd36829c238f31ae55863ddce7b96a83c4ca052ba5804` | **Active Deployed v2.5.0** |
| **Deployed Production Artifact (Python ML)** | `ml/models/physical_experimental_model.json` | `889c93f14827ab901f2cd36829c238f31ae55863ddce7b96a83c4ca052ba5804` | **Bit-for-bit Parity Verified** |
| **Mode A Frozen Research Model** | `src/data/ml/frozen-research-model.json` | `dceaf13798a5f1a078798f3d5a60f8dcd837d1401ea147ccc7e4a5a7112c1978` | **100% UNTOUCHED (Preserved)** |
| **Pre-Deployment Rollback Backup** | `backups/rollback/physical-experimental-model.json` | Snapshot verified in `backups/rollback/` | **Rollback Ready** |

---

## 5. Step-by-Step Reproduction Commands

To reproduce the complete pipeline from scratch on any machine:

### 1. Ingest Dataset, Audit, Train, and Verify Production Deployment
```powershell
python ml/src/train_and_deploy_physical_model.py
```
*Expected Output:*
- Audits 52 rows $\to$ 48 valid cuts.
- Runs 5-Fold GroupKFold cross-validation.
- Confirms Case A ($\le 5\%$) and Case 39 ($\le 5\%$) diagnostic gates.
- Confirms in-sample pass gates ($\ge 44/48$ for MRR, $\ge 46/48$ for TWR).
- Verifies Python vs Browser tree traversal parity ($< 10^{-15}$).
- Deploys JSON artifact to `src/data/ml/` and `ml/models/`.

### 2. Execute Master Validation, Metrics, and Publication Figures Pipeline
```powershell
python scratch/master_final_execution_pipeline.py
```
*Expected Output:*
- Generates `ml/reports/final_physical_edm_validation.csv`.
- Generates `ml/reports/final_physical_edm_metrics.csv`.
- Generates 300 DPI figures:
  - `final_physical_edm_actual_vs_predicted.png`
  - `final_physical_edm_error_distribution.png`
  - `final_physical_edm_error_by_experiment.png`
  - `final_physical_edm_baseline_vs_candidate.png`
- Generates `final_physical_edm_prediction_function.json`.

### 3. Run Automated 14-Point Test Suite
```powershell
pytest ml/tests/test_physical_model.py -v
```
*Expected Output:*
- `14 passed in < 3.0s`.

### 4. Run Production Build Verification
```powershell
cmd.exe /c "npm run build"
```
*Expected Output:*
- `tsc -b && vite build` completes with 0 errors.
