# EDM Literature Data Package — Initial Research Collection

This is an INITIAL, provenance-tagged collection of experimental EDM readings extracted from accessible published tables.

## Current contents

- 95 literature rows
- 4 source papers
- Multiple workpieces/electrodes
- MRR and/or TWR where reported
- Source ID attached to every row

## Important

This is NOT yet the final training dataset.

The user's `Data_sheet.csv` is intentionally kept in `quarantine/` because it has Current/Voltage/TON/MRR/TWR but lacks material/electrode/source identifiers. It must not be silently merged with literature data.

Some literature papers report mass-rate MRR/TWR while others report volumetric rates. These are retained in their original units and must be normalized only after the source definition and material density are verified.

## Sources

1. S2024_PAL — Ti-6Al-4V, Cu/WC/Graphite, 48 rows.
2. S2021_AL6061_PMEDM — Al 6061, Cu, 9 rows.
3. S2020_TOOLSTEEL — Tool steel, Cu, 8 rows.
4. S2025_NDFEB — sintered NdFeB, Cu, 30 rows (MRR only).

## Next collection phase

Continue extracting open-access experimental tables for:
- Ti-6Al-4V
- Waspaloy
- Inconel 718
- AISI D2
- AISI 304/316L
- Al 7075/6061
- EN31/EN24
- Hastelloy
- Inconel 600/625/718/825
- NiTi/NiCu/BeCu
- additional copper, graphite, brass, Cu-W, WC electrodes

Every row must retain source, table, experiment number, raw units, material, electrode and processing conditions.
