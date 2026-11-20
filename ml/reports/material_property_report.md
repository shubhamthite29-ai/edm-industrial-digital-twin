# Material Property Verification Report

Generated: 2026-09-10T09:59:05.905796+00:00

## Policy

- Only independently sourced material/electrode properties are placed in `value`.
- Paper-reported values are preserved in `original_source_value` when available.
- Missing, grade-dependent, or condition-dependent values remain blank instead of being guessed.
- Alloy melting ranges and grade-dependent ranges are stored as ranges and must not be forced into scalar ML features without an explicit feature policy.

## Training-Coverage Property Status

- grade_unspecified_reference: 1
- grade_unspecified_reference_range: 3
- missing: 17
- verified_reference: 30
- verified_reference_range: 7
- verified_secondary_reference_range: 2

## Material Details

### Aluminium 6061
- density_g_cm3: 2.70 g/cm3; status=verified_reference; source=PROP_MATWEB_AL6061_T6; original=none
- hardness: 95 HB; status=verified_reference; source=PROP_MATWEB_AL6061_T6; original=none
- melting_point_C: 582-652 C; status=verified_reference_range; source=PROP_MATWEB_AL6061_T6; original=none
- thermal_conductivity_W_mK: 167 W/mK; status=verified_reference; source=PROP_MATWEB_AL6061_T6; original=none
- specific_heat_J_kgK: 896 J/kgK; status=verified_reference; source=PROP_MATWEB_AL6061_T6; original=none
- electrical_resistivity_ohm_m: 3.99e-8 ohm m; status=verified_reference; source=PROP_MATWEB_AL6061_T6; original=none
- tensile_strength_MPa: 310 MPa; status=verified_reference; source=PROP_MATWEB_AL6061_T6; original=none
- yield_strength_MPa: 276 MPa; status=verified_reference; source=PROP_MATWEB_AL6061_T6; original=none
- toughness_MPa_sqrt_m: 29 MPa sqrt(m); status=verified_reference; source=PROP_MATWEB_AL6061_T6; original=none
- thermal_expansion: NULL expansion; status=missing; source=S2021_AL6061_PMEDM; original=none

### Brass
- density_g_cm3: 8.49 g/cm3; status=verified_reference; source=PROP_MATWEB_C36000; original=8.73 g/cm3 reported in S2022_WASPALOY_ELECTRODES
- hardness: NULL ; status=missing; source=PROP_MATWEB_C36000; original=none
- melting_point_C: 885-900 C; status=verified_reference_range; source=PROP_MATWEB_C36000; original=940 C reported in S2022_WASPALOY_ELECTRODES
- thermal_conductivity_W_mK: 115 W/mK; status=verified_reference; source=PROP_MATWEB_C36000; original=159 W/mK reported in S2022_WASPALOY_ELECTRODES
- specific_heat_J_kgK: 377 J/kgK; status=verified_reference; source=PROP_MATWEB_C36000; original=380 J/kgK reported in S2022_WASPALOY_ELECTRODES
- electrical_resistivity_ohm_m: 6.60e-8 ohm m; status=verified_reference; source=PROP_MATWEB_C36000; original=470 micro-ohm m reported in S2022_WASPALOY_ELECTRODES
- tensile_strength_MPa: 338-469 MPa; status=verified_reference_range; source=PROP_MATWEB_C36000; original=none
- yield_strength_MPa: 124-310 MPa; status=verified_reference_range; source=PROP_MATWEB_C36000; original=none
- toughness_MPa_sqrt_m: NULL ; status=missing; source=PROP_MATWEB_C36000; original=none
- thermal_expansion: NULL expansion; status=missing; source=S2022_WASPALOY_ELECTRODES; original=none

### Copper
- density_g_cm3: 8.91 g/cm3; status=verified_reference; source=PROP_COPPER_ORG_C11000; original=8.96 g/cm3 reported in S2022_WASPALOY_ELECTRODES
- hardness: NULL ; status=missing; source=PROP_COPPER_ORG_C11000; original=none
- melting_point_C: 1065-1083 C; status=verified_reference_range; source=PROP_COPPER_ORG_C11000; original=1045 C reported in S2022_WASPALOY_ELECTRODES
- thermal_conductivity_W_mK: 391 W/mK; status=verified_reference; source=PROP_COPPER_ORG_C11000; original=391 W/mK reported in S2022_WASPALOY_ELECTRODES
- specific_heat_J_kgK: 385 J/kgK; status=verified_reference; source=PROP_COPPER_ORG_C11000; original=385 J/kgK reported in S2022_WASPALOY_ELECTRODES
- electrical_resistivity_ohm_m: 1.707e-8 ohm m; status=verified_reference; source=PROP_COPPER_ORG_C11000; original=169 micro-ohm m reported in S2022_WASPALOY_ELECTRODES
- tensile_strength_MPa: NULL ; status=missing; source=PROP_COPPER_ORG_C11000; original=none
- yield_strength_MPa: NULL ; status=missing; source=PROP_COPPER_ORG_C11000; original=none
- toughness_MPa_sqrt_m: NULL ; status=missing; source=PROP_COPPER_ORG_C11000; original=none
- thermal_expansion: NULL expansion; status=missing; source=S2024_PAL; original=none

### Graphite
- density_g_cm3: 1.80-1.85 g/cm3; status=grade_unspecified_reference_range; source=PROP_NOVOTEC_EDM_GRAPHITE; original=1.85 g/cm3 reported in S2022_WASPALOY_ELECTRODES
- hardness: 56-83 Shore; status=grade_unspecified_reference_range; source=PROP_NOVOTEC_EDM_GRAPHITE; original=none
- melting_point_C: 3400 C; status=grade_unspecified_reference; source=PROP_MERSEN_GRAPHITE_EDM; original=3652 C reported in S2022_WASPALOY_ELECTRODES
- thermal_conductivity_W_mK: NULL ; status=missing; source=PROP_NOVOTEC_EDM_GRAPHITE; original=121 W/mK reported in S2022_WASPALOY_ELECTRODES
- specific_heat_J_kgK: NULL ; status=missing; source=PROP_NOVOTEC_EDM_GRAPHITE; original=706 J/kgK reported in S2022_WASPALOY_ELECTRODES
- electrical_resistivity_ohm_m: 1.1e-5-2.16e-5 ohm m; status=grade_unspecified_reference_range; source=PROP_NOVOTEC_EDM_GRAPHITE; original=3.5 micro-ohm m reported in S2022_WASPALOY_ELECTRODES
- tensile_strength_MPa: NULL ; status=missing; source=PROP_NOVOTEC_EDM_GRAPHITE; original=none
- yield_strength_MPa: NULL ; status=missing; source=PROP_NOVOTEC_EDM_GRAPHITE; original=none
- toughness_MPa_sqrt_m: NULL ; status=missing; source=PROP_NOVOTEC_EDM_GRAPHITE; original=none
- thermal_expansion: NULL expansion; status=missing; source=S2024_PAL; original=none

### Ti-6Al-4V
- density_g_cm3: 4.43 g/cm3; status=verified_reference; source=PROP_MATWEB_TI64_G5_ANNEALED; original=4.45 g/cm3 reported in S2025_TI64_MULTI_TOOL
- hardness: 334 HB; status=verified_reference; source=PROP_MATWEB_TI64_G5_ANNEALED; original=none
- melting_point_C: 1604-1660 C; status=verified_reference_range; source=PROP_MATWEB_TI64_G5_ANNEALED; original=none
- thermal_conductivity_W_mK: 6.70 W/mK; status=verified_reference; source=PROP_MATWEB_TI64_G5_ANNEALED; original=none
- specific_heat_J_kgK: 526.3 J/kgK; status=verified_reference; source=PROP_MATWEB_TI64_G5_ANNEALED; original=none
- electrical_resistivity_ohm_m: 1.78e-6 ohm m; status=verified_reference; source=PROP_MATWEB_TI64_G5_ANNEALED; original=none
- tensile_strength_MPa: 950 MPa; status=verified_reference; source=PROP_MATWEB_TI64_G5_ANNEALED; original=none
- yield_strength_MPa: 880 MPa; status=verified_reference; source=PROP_MATWEB_TI64_G5_ANNEALED; original=none
- toughness_MPa_sqrt_m: 74.6 MPa sqrt(m); status=verified_reference; source=PROP_MATWEB_TI64_G5_ANNEALED; original=none
- thermal_expansion: NULL expansion; status=missing; source=S2021_SHIRGUPPIKAR_TI64_AL; original=none

### Waspaloy
- density_g_cm3: 8.20 g/cm3; status=verified_reference; source=PROP_NICKEL_SYSTEMS_WASPALOY; original=none
- hardness: 310 HB; status=verified_reference; source=PROP_NICKEL_SYSTEMS_WASPALOY; original=none
- melting_point_C: 1330-1360 C; status=verified_reference_range; source=PROP_NICKEL_SYSTEMS_WASPALOY; original=none
- thermal_conductivity_W_mK: 12.6 W/mK; status=verified_reference; source=PROP_NICKEL_SYSTEMS_WASPALOY; original=none
- specific_heat_J_kgK: 513-534 J/kgK; status=verified_secondary_reference_range; source=PROP_MODULUS_WASPALOY; original=none
- electrical_resistivity_ohm_m: 1.24e-6 ohm m; status=verified_reference; source=PROP_HAYNES_WASPALOY; original=none
- tensile_strength_MPa: 1100 MPa; status=verified_reference; source=PROP_NICKEL_SYSTEMS_WASPALOY; original=none
- yield_strength_MPa: 760 MPa; status=verified_reference; source=PROP_NICKEL_SYSTEMS_WASPALOY; original=none
- toughness_MPa_sqrt_m: 123-136 MPa sqrt(m); status=verified_secondary_reference_range; source=PROP_MODULUS_WASPALOY; original=none
- thermal_expansion: NULL expansion; status=missing; source=S2022_WASPALOY_ELECTRODES; original=none

## Training Gate

Do not use material-aware features in final training until blank and low-confidence graphite/copper/brass mechanical properties are either verified for the actual electrode grades or intentionally excluded by a documented feature policy.