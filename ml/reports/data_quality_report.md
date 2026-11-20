# EDM Literature Data Quality Report

Generated: 2026-09-10T09:59:05.904795+00:00

## Summary

- Total literature rows: 232
- Valid canonical training rows: 114
- Usable MRR training rows: 114
- Usable TWR training rows: 99
- Source papers in registry: 8
- Source papers with verified canonical training rows: 4
- Quarantined literature rows: 118
- Direct real experimental canonical rows: 84
- Density-derived canonical rows: 30

## Unit Handling

- MRR/TWR rows are used only when their canonical volumetric `mm3/min` value is directly reported or has a source-specific, documented density conversion.
- EWR/electrode wear ratio and any target with an unresolved definition remain quarantined.
- Missing material/electrode properties remain blank rather than fabricated.

## Remaining Unit/Definition Problems

- S2024_PAL reports mass-rate MRR/TWR in mg/s; volume conversion needs verified densities and source definition review.
- S2020_TOOLSTEEL unit presentation requires source verification before canonical use.
- S2025_NDFEB reports MRR in mg/min and no TWR; density/definition verification required before MRR volume conversion.
- C2017_IN718_DEEP_HOLE reports EWR; EWR must not be silently converted to TWR.
- Attached SS304/aluminium report observations remain in needs_review quarantine pending independently verified material-property records.
- S2023_SHIRGUPPIKAR_GRAPHENE response columns contain published numbers but table-unit verification is incomplete; all rows remain quarantined.

## Source Registry

- `S2024_PAL` (2024): Micro-EDM of Ti–6Al–4V Using Various Tool Materials: Multi-Response Optimization and Surface Characterization | outputs: MRR; TWR
- `S2021_AL6061_PMEDM` (2021): Experimental investigation of Aluminum alloy 6061 machining in Powder Mixed EDM | outputs: MRR; TWR; Ra
- `S2020_TOOLSTEEL` (2020): Study on tool steel machining with ZNC EDM by RSM, GREY and NSGA | outputs: MRR; TWR
- `S2025_NDFEB` (2025): Interaction of Machining Parameters on MRR of Sintered NdFeB Processed by EDM-Milling | outputs: MRR
- `S2021_SHIRGUPPIKAR_TI64_AL` (2021): Assessing the Effects of Uncoated and Coated Electrode on Response Variables in Electrical Discharge Machining for Ti-6Al-4V Titanium Alloy | outputs: MRR; TWR; Ra
- `S2022_WASPALOY_ELECTRODES` (2022): Investigating the effect of different tool electrodes in electric discharge drilling of Waspaloy on process responses | outputs: MRR; TWR; Ra
- `S2025_TI64_MULTI_TOOL` (2025): Performance evaluation and multi-objective optimization of EDM parameters for Ti6Al4V using different tool electrodes | outputs: MRR; TWR; SR; DD

## Methodology Gate

The user's experimental dataset is stored in quarantine and is not used for training, feature selection, or model selection.