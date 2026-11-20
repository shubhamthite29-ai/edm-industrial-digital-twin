# EDM Research Data Collection Report

Generated: 2026-09-10T09:59:05.905796+00:00

## Methodology Gate

- User experimental `Data_sheet.csv` remains quarantined and was not used for training, tuning, feature selection, model selection, preprocessing decisions, or threshold tuning.
- Siddharth Dhobal and Swapnil reports are explicitly excluded from training, validation, feature selection, model selection, tuning, and benchmarking.
- EWR/electrode wear ratio is not treated as TWR unless the source definition explicitly supports a volumetric tool wear rate.

## Collection Summary

- Total research papers in registry: 8
- Additional candidate papers recorded but not imported: 9
- Papers actually used in canonical rows: 4
- Curated addition rows added: 75
- Total experimental rows inspected/imported: 232
- Usable MRR rows: 114
- Usable TWR rows: 99
- Rows quarantined from literature target conversion: 118
- Real experimental canonical rows: 84
- Derived canonical rows: 30
- Digitized canonical rows: 0
- Synthetic canonical rows: 0
- Attached files inspected: 3

## Source Coverage

- `S2024_PAL` [QUARANTINE_OR_REFERENCE] Micro-EDM of Ti–6Al–4V Using Various Tool Materials: Multi-Response Optimization and Surface Characterization (2024); workpiece: Ti-6Al-4V Grade 5; electrodes: Copper; Tungsten Carbide; Synthetic Graphite; table: Table 3; units: mg/s
- `S2021_AL6061_PMEDM` [USED] Experimental investigation of Aluminum alloy 6061 machining in Powder Mixed EDM (2021); workpiece: Aluminum 6061; electrodes: Copper 99.9%; table: Table 2; units: mm3/min
- `S2020_TOOLSTEEL` [QUARANTINE_OR_REFERENCE] Study on tool steel machining with ZNC EDM by RSM, GREY and NSGA (2020); workpiece: Tool steel; electrodes: Copper; table: Table 3; units: reported in source table
- `S2025_NDFEB` [QUARANTINE_OR_REFERENCE] Interaction of Machining Parameters on MRR of Sintered NdFeB Processed by EDM-Milling (2025); workpiece: Sintered NdFeB; electrodes: Columnar Copper, Ø6 mm; table: Table 1; units: mg/min
- `S2021_SHIRGUPPIKAR_TI64_AL` [USED] Assessing the Effects of Uncoated and Coated Electrode on Response Variables in Electrical Discharge Machining for Ti-6Al-4V Titanium Alloy (2021); workpiece: Ti-6Al-4V; electrodes: Aluminium; AlCrNi-coated Aluminium; table: Table 4; units: g/min
- `S2022_WASPALOY_ELECTRODES` [USED] Investigating the effect of different tool electrodes in electric discharge drilling of Waspaloy on process responses (2022); workpiece: Waspaloy; electrodes: Copper; Brass; Graphite; table: Table 5; units: mm3/min
- `S2025_TI64_MULTI_TOOL` [USED] Performance evaluation and multi-objective optimization of EDM parameters for Ti6Al4V using different tool electrodes (2025); workpiece: Ti6Al4V; electrodes: Copper; Brass; Graphite; table: Table 4; units: mm3/min

## Attached Report Review

- `R2024_25_SWAPNIL_SS304` [needs_review] Swapnil Report.docx: 32 rows extracted; Numerical values are readable, but SS304 and aluminium/graphene-coated electrode property records are not independently verified in the current material database. Stage 2 tool-weight-gain rows are not valid TWR observations. This source is excluded from the frozen training model.
- `R2024_25_SIDDHARTH_TI64` [needs_review] Siddharth Dhobal Project Report - Copy.docx: 0 rows extracted; The displayed table structure contains headers and experiment numbers but no readable numeric parameter or response values. No observations were created.
- `Report Format _ URE Track AY 2024-25_swap.pdf` [REFERENCE_ONLY]: report formatting template; no experimental observations extracted.

## Candidate Sources Not Imported

- `S2020_SHIRGUPPIKAR_MICRO_WC_TIN` Experimental investigation on micro-electro discharge machining process using tungsten carbide and titanium nitride-coated micro-tool electrode for machining of Ti-6Al-4V (2020): candidate_not_imported - Full numerical experimental table was not legally retrievable in this environment. Keep separate from conventional EDM even after extraction.
- `S2024_SHIRGUPPIKAR_MICRO_COATED` Improving Micro-EDM Machining Efficiency for Titanium Alloy Fabrication with Advanced Coated Electrodes (2024): candidate_not_imported - The accessible article establishes a micro-EDM mass-rate TWR definition but no verified tabular raw target set was extracted; do not pool with conventional EDM.
- `S2021_SHIRGUPPIKAR_AL_TOOL` Material Removal Rate in Electric Discharge Machining with Aluminum Tool Electrode for Ti-6Al-4V Titanium Alloy (2021): candidate_not_imported - No legally accessible complete numerical table was verified during this collection pass.
- `S2023_SHIRGUPPIKAR_CARBON_WC` Influence of carbon coated WC electrode on drilling measures of Ti-6Al-4V alloy in micro-EDM process (2023): candidate_not_imported - The citation is verified but a complete numerical table and target units were not retrievable for canonical import.
- `S2023_SHIRGUPPIKAR_GRAPHENE` Influence of graphene coating in electrical discharge machining with an aluminum electrode (2023): candidate_quarantined_units_unverified - Table 2 contains numerical response values but the response units cannot be verified from the accessible table; no canonical target rows were created.
- `S2024_SHIRGUPPIKAR_PMEDM` A Study on Material Removal Rate in Powder-Mixed Electro-Discharge Machining Utilizing Integrated Experimental and Computational Fluid Dynamics Analysis (2024): candidate_not_imported - Process compatibility and complete experimental table require review before any import; do not combine powder-mixed and conventional EDM blindly.
- `C2017_IN718_DEEP_HOLE` Performance Evaluation of Electrode Materials in Electric Discharge Deep Hole Drilling of Inconel 718 Superalloy (2017): candidate_not_imported - Open abstract confirms EWR rather than TWR; experimental table values must be extracted and EWR definition reviewed before any target use.
- `C2024_WASPALOY_MOO` Multi-objective optimization for electric discharge drilling of waspaloy: A comparative analysis of NSGA-II MOGA MOGWO and MOPSO (2024): candidate_mrr_only - Actual Table 4 is accessible and reports MRR only; not imported into the TWR dataset.
- `C2025_C120_TOOL_WEAR` Investigation of the Impact of Intensive EDM Regimes on Electrode Wear When Machining C120 Steel Parts (2026): candidate_not_imported - Source appears useful for TWR but year/source details and full experimental rows require review before import.

## Workpiece Materials in Usable Rows

- Aluminium 6061
- Ti-6Al-4V
- Waspaloy

## Electrode Materials in Usable Rows

- Aluminium
- Brass
- Copper
- Graphite

## Unit Conversions

- mrr_source_reported_mm3_min_no_conversion
- twr_source_reported_mm3_min_no_conversion
- S2021_SHIRGUPPIKAR_TI64_AL: MRR g/min to mm3/min using independently verified Ti-6Al-4V Grade 5 density 4.43 g/cm3.
- S2021_SHIRGUPPIKAR_TI64_AL: uncoated aluminium TWR g/min to mm3/min using independently verified aluminium density 2.70 g/cm3.

## Remaining Problems

- S2024_PAL reports mass-rate MRR/TWR in mg/s; volume conversion needs verified densities and source definition review.
- S2020_TOOLSTEEL unit presentation requires source verification before canonical use.
- S2025_NDFEB reports MRR in mg/min and no TWR; density/definition verification required before MRR volume conversion.
- C2017_IN718_DEEP_HOLE reports EWR; EWR must not be silently converted to TWR.
- Attached SS304/aluminium report observations remain in needs_review quarantine pending independently verified material-property records.
- S2023_SHIRGUPPIKAR_GRAPHENE response columns contain published numbers but table-unit verification is incomplete; all rows remain quarantined.

## Training Decision

The frozen model is trained only on canonical published-literature rows. Siddharth Dhobal, Swapnil, and user experimental observations are not in training, preprocessing, feature selection, model selection, validation, or tuning.