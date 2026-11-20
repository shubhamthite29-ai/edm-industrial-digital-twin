from __future__ import annotations

import csv
import itertools
import json
import math
import random
import shutil
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
SOURCES_DIR = DATA_DIR / "sources"
QUARANTINE_DIR = DATA_DIR / "quarantine"
USER_TEST_DIR = DATA_DIR / "test" / "user_experimental"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
CURATED_ADDITIONS_PATH = RAW_DIR / "curated_literature_additions.csv"
CURATED_SOURCE_ADDITIONS_PATH = SOURCES_DIR / "curated_source_additions.csv"
CANDIDATE_SOURCES_PATH = SOURCES_DIR / "candidate_sources.csv"
VERIFIED_PROPERTIES_PATH = SOURCES_DIR / "verified_material_properties.csv"
ATTACHED_SOURCE_REGISTRY_PATH = SOURCES_DIR / "attached_source_registry.csv"

MASTER_COLUMNS = [
    "source_id",
    "paper_title",
    "paper_year",
    "doi",
    "table_number",
    "experiment_number",
    "process_type",
    "workpiece_material",
    "electrode_material",
    "electrode_coating",
    "current_A",
    "voltage_V",
    "ton_us",
    "toff_us",
    "duty_cycle",
    "gap_um",
    "electrode_rotation_rpm",
    "flushing_pressure",
    "polarity",
    "dielectric",
    "workpiece_density_g_cm3",
    "workpiece_hardness",
    "workpiece_hardness_scale",
    "workpiece_melting_point_C",
    "workpiece_thermal_conductivity_W_mK",
    "workpiece_specific_heat_J_kgK",
    "workpiece_electrical_resistivity_ohm_m",
    "workpiece_tensile_strength_MPa",
    "workpiece_yield_strength_MPa",
    "workpiece_toughness_MPa_sqrt_m",
    "electrode_density_g_cm3",
    "electrode_hardness",
    "electrode_hardness_scale",
    "electrode_melting_point_C",
    "electrode_thermal_conductivity_W_mK",
    "electrode_specific_heat_J_kgK",
    "electrode_electrical_resistivity_ohm_m",
    "electrode_tensile_strength_MPa",
    "electrode_toughness_MPa_sqrt_m",
    "mrr",
    "mrr_unit",
    "twr",
    "twr_unit",
    "target_definition",
    "raw_mrr_value",
    "raw_mrr_unit",
    "raw_twr_value",
    "raw_twr_unit",
    "conversion_method",
    "processing_notes",
    "data_type",
    "validation_status",
]

MATERIAL_COLUMNS = [
    "material_id",
    "material_name",
    "material_type",
    "property",
    "value",
    "unit",
    "source_id",
    "source_url",
    "material_grade_condition",
    "property_condition",
    "confidence",
    "original_source_value",
    "validation_status",
]

NUMERIC_FEATURES = [
    "current_A",
    "voltage_V",
    "ton_us",
    "toff_us",
    "duty_cycle",
    "gap_um",
    "electrode_rotation_rpm",
    "flushing_pressure",
    "workpiece_density_g_cm3",
    "workpiece_hardness",
    "workpiece_melting_point_C",
    "workpiece_thermal_conductivity_W_mK",
    "workpiece_specific_heat_J_kgK",
    "workpiece_electrical_resistivity_ohm_m",
    "workpiece_tensile_strength_MPa",
    "workpiece_yield_strength_MPa",
    "workpiece_toughness_MPa_sqrt_m",
    "electrode_density_g_cm3",
    "electrode_hardness",
    "electrode_melting_point_C",
    "electrode_thermal_conductivity_W_mK",
    "electrode_specific_heat_J_kgK",
    "electrode_electrical_resistivity_ohm_m",
    "electrode_tensile_strength_MPa",
    "electrode_toughness_MPa_sqrt_m",
    "power_proxy",
    "current_ton_proxy",
    "voltage_ton_proxy",
    "pulse_energy_proxy",
]

CATEGORICAL_FEATURES = [
    "workpiece_material",
    "electrode_material",
    "electrode_coating",
    "dielectric",
    "polarity",
]

PRIMARY_PROCESS_FEATURES = ["current_A", "voltage_V", "ton_us"]
PRIMARY_CATEGORICAL_FEATURES = ["workpiece_material", "electrode_material"]

# Voltage and rotation are not populated across the same source groups as the
# primary targets. Do not median-impute them or treat reference material
# properties as independently measured experimental process features.
MODEL_CONFIGS = {
    "research_supported_core": {
        "label": "Research-supported process and material categories",
        "numeric_features": PRIMARY_PROCESS_FEATURES,
        "categorical_features": PRIMARY_CATEGORICAL_FEATURES,
    },
}

DATASET_VERSION = "literature-v0.4-shirguppikar-first"
MODEL_VERSION = "edm-ml-v1.2-browser"


def ensure_dirs() -> None:
    for path in [RAW_DIR, PROCESSED_DIR, SOURCES_DIR, QUARANTINE_DIR, USER_TEST_DIR, MODELS_DIR, REPORTS_DIR]:
        path.mkdir(parents=True, exist_ok=True)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if "-" in text and not text.lower().startswith(("e", "nan")):
        pieces = [piece.strip() for piece in text.replace("–", "-").split("-")]
        if len(pieces) == 2:
            low = as_float(pieces[0])
            high = as_float(pieces[1])
            if low is not None and high is not None:
                return (low + high) / 2
    try:
        number = float(text.replace(",", ""))
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def normalize_material(value: str) -> str:
    text = (value or "").strip()
    aliases = {
        "Aluminum 6061": "Aluminium 6061",
        "Aluminum": "Aluminium",
        "Ti6Al4V": "Ti-6Al-4V",
        "Ti64": "Ti-6Al-4V",
        "Copper 99.9%": "Copper",
        "Synthetic Graphite": "Graphite",
        "Columnar Copper, Ø6 mm": "Copper",
        "Columnar Copper, \u00d86 mm": "Copper",
    }
    return aliases.get(text, text)


def duty_cycle(ton: float | None, toff: float | None) -> float | None:
    if ton is None or toff is None or ton + toff <= 0:
        return None
    return ton / (ton + toff)


def extract_package(package_zip: Path) -> None:
    ensure_dirs()
    package_dir = RAW_DIR / "literature_package"
    package_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(package_zip) as archive:
        archive.extractall(package_dir)

    source_registry = package_dir / "sources" / "source_registry.csv"
    if source_registry.exists():
        shutil.copyfile(source_registry, SOURCES_DIR / "source_registry.csv")

    user_data = package_dir / "quarantine" / "user_Data_sheet_unverified.csv"
    if user_data.exists():
        shutil.copyfile(user_data, QUARANTINE_DIR / "user_Data_sheet_unverified.csv")


def build_material_database(literature_rows: list[dict[str, str]], source_rows: list[dict[str, str]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    verified_properties = load_verified_property_lookup()
    source_by_material: dict[str, dict[str, str]] = {}
    for source in source_rows:
        workpiece = normalize_material(source.get("workpiece", ""))
        if workpiece and workpiece not in source_by_material:
            source_by_material[workpiece] = source

    electrode_sources: dict[str, dict[str, str]] = {}
    for row in literature_rows:
        electrode = normalize_material(row.get("electrode", ""))
        if electrode and electrode not in electrode_sources:
            electrode_sources[electrode] = {
                "source_id": row.get("source_id", ""),
                "source_url": row.get("source_url", ""),
            }

    properties = [
        "density_g_cm3",
        "hardness",
        "melting_point_C",
        "thermal_conductivity_W_mK",
        "specific_heat_J_kgK",
        "electrical_resistivity_ohm_m",
        "tensile_strength_MPa",
        "yield_strength_MPa",
        "toughness_MPa_sqrt_m",
        "thermal_expansion",
    ]

    material_rows: list[dict[str, Any]] = []
    for material in sorted({normalize_material(row.get("workpiece", "")) for row in literature_rows if row.get("workpiece")}):
        source = source_by_material.get(material, {})
        for prop in properties:
            original_value = original_source_property(material, prop)
            verified = verified_properties.get((material, "workpiece", prop), {})
            material_rows.append(
                {
                    "material_id": material.lower().replace(" ", "_").replace("-", "_"),
                    "material_name": material,
                    "material_type": "workpiece",
                    "property": prop,
                    "value": verified.get("value", ""),
                    "unit": verified.get("unit", prop.split("_", 1)[-1] if "_" in prop else ""),
                    "source_id": verified.get("source_id", source.get("source_id", "")),
                    "source_url": verified.get("source_url", source.get("url", "")),
                    "material_grade_condition": verified.get("material_grade_condition", source.get("workpiece", material)),
                    "property_condition": verified.get("property_condition", "not_verified_in_starter_package"),
                    "confidence": verified.get("confidence", "missing_requires_datasheet"),
                    "original_source_value": original_value,
                    "validation_status": verified.get("validation_status", "requires_independent_verification" if original_value else "missing"),
                }
            )

    electrode_rows: list[dict[str, Any]] = []
    for electrode in sorted(electrode_sources):
        source = electrode_sources[electrode]
        for prop in properties:
            original_value = original_source_property(electrode, prop)
            verified = verified_properties.get((electrode, "electrode", prop), {})
            electrode_rows.append(
                {
                    "material_id": electrode.lower().replace(" ", "_").replace("-", "_"),
                    "material_name": electrode,
                    "material_type": "electrode",
                    "property": prop,
                    "value": verified.get("value", ""),
                    "unit": verified.get("unit", prop.split("_", 1)[-1] if "_" in prop else ""),
                    "source_id": verified.get("source_id", source.get("source_id", "")),
                    "source_url": verified.get("source_url", source.get("source_url", "")),
                    "material_grade_condition": verified.get("material_grade_condition", electrode),
                    "property_condition": verified.get("property_condition", "not_verified_in_starter_package"),
                    "confidence": verified.get("confidence", "missing_requires_datasheet"),
                    "original_source_value": original_value,
                    "validation_status": verified.get("validation_status", "requires_independent_verification" if original_value else "missing"),
                }
            )

    return material_rows, electrode_rows


def original_source_property(material: str, prop: str) -> str:
    source_values = {
        "Ti-6Al-4V": {
            "density_g_cm3": "4.45 g/cm3 reported in S2025_TI64_MULTI_TOOL",
        },
        "Waspaloy": {
            "composition": "Cr 19.10%, Co 12.73%, Ti 2.846%, Al 1.365%, Ni balance reported in S2022_WASPALOY_ELECTRODES",
        },
        "Copper": {
            "density_g_cm3": "8.96 g/cm3 reported in S2022_WASPALOY_ELECTRODES",
            "melting_point_C": "1045 C reported in S2022_WASPALOY_ELECTRODES",
            "thermal_conductivity_W_mK": "391 W/mK reported in S2022_WASPALOY_ELECTRODES",
            "specific_heat_J_kgK": "385 J/kgK reported in S2022_WASPALOY_ELECTRODES",
            "electrical_resistivity_ohm_m": "169 micro-ohm m reported in S2022_WASPALOY_ELECTRODES",
        },
        "Brass": {
            "density_g_cm3": "8.73 g/cm3 reported in S2022_WASPALOY_ELECTRODES",
            "melting_point_C": "940 C reported in S2022_WASPALOY_ELECTRODES",
            "thermal_conductivity_W_mK": "159 W/mK reported in S2022_WASPALOY_ELECTRODES",
            "specific_heat_J_kgK": "380 J/kgK reported in S2022_WASPALOY_ELECTRODES",
            "electrical_resistivity_ohm_m": "470 micro-ohm m reported in S2022_WASPALOY_ELECTRODES",
        },
        "Graphite": {
            "density_g_cm3": "1.85 g/cm3 reported in S2022_WASPALOY_ELECTRODES",
            "melting_point_C": "3652 C reported in S2022_WASPALOY_ELECTRODES",
            "thermal_conductivity_W_mK": "121 W/mK reported in S2022_WASPALOY_ELECTRODES",
            "specific_heat_J_kgK": "706 J/kgK reported in S2022_WASPALOY_ELECTRODES",
            "electrical_resistivity_ohm_m": "3.5 micro-ohm m reported in S2022_WASPALOY_ELECTRODES",
        },
    }
    return source_values.get(material, {}).get(prop, "")


def load_verified_property_lookup() -> dict[tuple[str, str, str], dict[str, str]]:
    if not VERIFIED_PROPERTIES_PATH.exists():
        return {}
    lookup: dict[tuple[str, str, str], dict[str, str]] = {}
    for row in read_csv(VERIFIED_PROPERTIES_PATH):
        key = (normalize_material(row.get("material_name", "")), row.get("material_type", ""), row.get("property", ""))
        lookup[key] = row
    return lookup


PROPERTY_FEATURE_MAP = {
    "density_g_cm3": "density_g_cm3",
    "hardness": "hardness",
    "melting_point_C": "melting_point_C",
    "thermal_conductivity_W_mK": "thermal_conductivity_W_mK",
    "specific_heat_J_kgK": "specific_heat_J_kgK",
    "electrical_resistivity_ohm_m": "electrical_resistivity_ohm_m",
    "tensile_strength_MPa": "tensile_strength_MPa",
    "yield_strength_MPa": "yield_strength_MPa",
    "toughness_MPa_sqrt_m": "toughness_MPa_sqrt_m",
}


def material_property_index(rows: list[dict[str, Any]], material_type: str) -> dict[str, dict[str, float]]:
    index: dict[str, dict[str, float]] = {}
    for row in rows:
        if row.get("material_type") != material_type:
            continue
        material = normalize_material(str(row.get("material_name", "")))
        prop = row.get("property", "")
        feature = PROPERTY_FEATURE_MAP.get(prop)
        value = as_float(row.get("value"))
        if material and feature and value is not None:
            index.setdefault(material, {})[feature] = value
    return index


def enrich_training_rows(master: list[dict[str, Any]], materials: list[dict[str, Any]], electrodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    workpiece_props = material_property_index(materials, "workpiece")
    electrode_props = material_property_index(electrodes, "electrode")
    enriched_rows: list[dict[str, Any]] = []
    for row in master:
        enriched = dict(row)
        for prop, value in workpiece_props.get(normalize_material(str(row.get("workpiece_material", ""))), {}).items():
            enriched[f"workpiece_{prop}"] = value
        for prop, value in electrode_props.get(normalize_material(str(row.get("electrode_material", ""))), {}).items():
            enriched[f"electrode_{prop}"] = value
        enriched_rows.append(enriched)
    return enriched_rows


def canonicalize_literature_rows(rows: list[dict[str, str]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    master: list[dict[str, Any]] = []
    quarantine: list[dict[str, Any]] = []

    for row in rows:
        mrr = as_float(row.get("mrr_volume_mm3_min"))
        twr_volume = as_float(row.get("twr_volume_mm3_min"))
        twr = twr_volume
        source_id = row.get("source_id", "")
        raw_mrr_unit = row.get("mrr_unit_raw", "")
        raw_twr_unit = row.get("twr_unit_raw", "")
        reason = ""

        if mrr is None and raw_mrr_unit.strip().lower() in {"mm3/min", "mm^3/min", "mm³/min"}:
            mrr = as_float(row.get("mrr_raw"))
        if twr_volume is None and raw_twr_unit.strip().lower() in {"mm3/min", "mm^3/min", "mm³/min"}:
            twr_volume = as_float(row.get("twr_raw"))

        electrode = normalize_material(row.get("electrode", ""))

        if mrr is None and row.get("mrr_raw"):
            reason += "MRR lacks verified canonical mm3/min conversion. "
        if twr is None and row.get("twr_raw"):
            reason += "TWR lacks verified canonical mm3/min conversion. "
        if source_id == "S2020_TOOLSTEEL":
            reason += "Source unit presentation requires verification. "
        if source_id == "S2025_NDFEB":
            reason += "MRR is reported as mass rate and TWR is absent. "
        if source_id == "S2024_PAL":
            reason += "MRR/TWR are mass rates; volume conversion needs verified material/electrode density and target definition. "

        current = as_float(row.get("current_A"))
        voltage = as_float(row.get("voltage_V"))
        ton = as_float(row.get("ton_us"))
        toff = as_float(row.get("toff_us"))
        raw_status = row.get("data_status", "").strip().upper()
        data_status = raw_status if raw_status in {"REAL_EXPERIMENTAL", "DIGITIZED", "DERIVED", "SYNTHETIC"} else "REAL_EXPERIMENTAL"
        if row.get("mrr_conversion_method") or row.get("twr_conversion_method"):
            # The paper observations remain raw evidence, but their canonical
            # volumetric targets are calculated from a documented density.
            data_status = "DERIVED"

        base = {
            "source_id": source_id,
            "paper_title": row.get("source_title", ""),
            "paper_year": row.get("source_year", ""),
            "doi": row.get("doi", ""),
            "table_number": row.get("table", ""),
            "experiment_number": row.get("experiment", ""),
            "process_type": row.get("process_type", "unspecified"),
            "workpiece_material": normalize_material(row.get("workpiece", "")),
            "electrode_material": electrode,
            "electrode_coating": row.get("electrode_coating", "uncoated") or "uncoated",
            "current_A": current,
            "voltage_V": voltage,
            "ton_us": ton,
            "toff_us": toff,
            "duty_cycle": duty_cycle(ton, toff),
            "gap_um": "",
            "electrode_rotation_rpm": as_float(row.get("electrode_rotation_rpm")) if as_float(row.get("electrode_rotation_rpm")) is not None else "",
            "flushing_pressure": as_float(row.get("flushing_pressure")) or as_float(row.get("powder_concentration_g_L")) or "",
            "polarity": row.get("polarity", ""),
            "dielectric": row.get("dielectric", ""),
            "workpiece_density_g_cm3": "",
            "workpiece_hardness": "",
            "workpiece_hardness_scale": "",
            "workpiece_melting_point_C": "",
            "workpiece_thermal_conductivity_W_mK": "",
            "workpiece_specific_heat_J_kgK": "",
            "workpiece_electrical_resistivity_ohm_m": "",
            "workpiece_tensile_strength_MPa": "",
            "workpiece_yield_strength_MPa": "",
            "workpiece_toughness_MPa_sqrt_m": "",
            "electrode_density_g_cm3": "",
            "electrode_hardness": "",
            "electrode_hardness_scale": "",
            "electrode_melting_point_C": "",
            "electrode_thermal_conductivity_W_mK": "",
            "electrode_specific_heat_J_kgK": "",
            "electrode_electrical_resistivity_ohm_m": "",
            "electrode_tensile_strength_MPa": "",
            "electrode_toughness_MPa_sqrt_m": "",
            "mrr": mrr if mrr is not None else "",
            "mrr_unit": "mm3/min" if mrr is not None else "",
            "twr": twr if twr is not None else "",
            "twr_unit": "mm3/min" if twr is not None else "",
            "target_definition": row.get("target_definition", "source_reported_volumetric_mrr_and_twr") if mrr is not None or twr is not None else "",
            "raw_mrr_value": row.get("mrr_raw", ""),
            "raw_mrr_unit": raw_mrr_unit,
            "raw_twr_value": row.get("twr_raw", ""),
            "raw_twr_unit": raw_twr_unit,
            "conversion_method": "; ".join(filter(None, [row.get("mrr_conversion_method", "") if mrr is not None else "", row.get("twr_conversion_method", "") if twr is not None else "", "mrr_source_reported_mm3_min_no_conversion" if mrr is not None and not row.get("mrr_conversion_method") else "", "twr_source_reported_mm3_min_no_conversion" if twr is not None and not row.get("twr_conversion_method") else ""])),
            "processing_notes": row.get("notes", "MRR and TWR are retained only where the source reports verified volumetric mm3/min. EWR and mass-rate targets are not silently converted or merged."),
            "data_type": data_status,
            "validation_status": "verified_canonical_literature" if (mrr is not None or twr is not None) else "needs_review",
        }

        if mrr is not None or twr is not None:
            master.append(base)
        else:
            quarantined = dict(base)
            quarantined["quarantine_reason"] = reason.strip() or "No verified canonical target."
            quarantine.append(quarantined)

    return master, quarantine


def build_processed_dataset(package_zip: Path) -> dict[str, Any]:
    extract_package(package_zip)
    package_dir = RAW_DIR / "literature_package"
    literature_rows = read_csv(package_dir / "master_literature_dataset.csv")
    source_rows = read_csv(package_dir / "sources" / "source_registry.csv")
    if CURATED_ADDITIONS_PATH.exists():
        literature_rows.extend(read_csv(CURATED_ADDITIONS_PATH))
    if CURATED_SOURCE_ADDITIONS_PATH.exists():
        source_rows.extend(read_csv(CURATED_SOURCE_ADDITIONS_PATH))
    # Keep each later source extraction in its own immutable CSV rather than
    # repeatedly rewriting the original literature package.
    for path in sorted(RAW_DIR.glob("*_literature_rows.csv")):
        literature_rows.extend(read_csv(path))
    for path in sorted(RAW_DIR.glob("*_quarantine_rows.csv")):
        literature_rows.extend(read_csv(path))

    master, quarantine = canonicalize_literature_rows(literature_rows)
    materials, electrodes = build_material_database(literature_rows, source_rows)
    master = enrich_training_rows(master, materials, electrodes)
    mrr_training = [row for row in master if as_float(row.get("mrr")) is not None]
    twr_training = [row for row in master if as_float(row.get("twr")) is not None]

    write_csv(PROCESSED_DIR / "master_training_dataset.csv", master, MASTER_COLUMNS)
    write_csv(PROCESSED_DIR / "mrr_training_dataset.csv", mrr_training, MASTER_COLUMNS)
    write_csv(PROCESSED_DIR / "twr_training_dataset.csv", twr_training, MASTER_COLUMNS)
    write_csv(PROCESSED_DIR / "materials.csv", materials, MATERIAL_COLUMNS)
    write_csv(PROCESSED_DIR / "electrodes.csv", electrodes, MATERIAL_COLUMNS)
    write_csv(SOURCES_DIR / "merged_source_registry.csv", source_rows, ["source_id", "title", "year", "doi", "url", "workpiece", "electrodes", "outputs", "table_used", "raw_units", "notes"])
    write_csv(QUARANTINE_DIR / "unverified_literature_rows.csv", quarantine, MASTER_COLUMNS + ["quarantine_reason"])

    candidate_rows = read_csv(CANDIDATE_SOURCES_PATH) if CANDIDATE_SOURCES_PATH.exists() else []
    attached_sources = read_csv(ATTACHED_SOURCE_REGISTRY_PATH) if ATTACHED_SOURCE_REGISTRY_PATH.exists() else []
    stats = {
        "total_literature_rows": len(literature_rows),
        "training_rows": len(master),
        "mrr_training_rows": len(mrr_training),
        "twr_training_rows": len(twr_training),
        "rows_excluded_due_to_target_problems": len(quarantine),
        "rows_excluded_due_to_feature_problems": 0,
        "paper_count": len({row.get("source_id") for row in literature_rows if row.get("source_id")}),
        "usable_paper_count": len({row.get("source_id") for row in master if row.get("source_id")}),
        "workpiece_materials": sorted({row["workpiece_material"] for row in master if row.get("workpiece_material")}),
        "electrode_materials": sorted({row["electrode_material"] for row in master if row.get("electrode_material")}),
        "quarantined_rows": len(quarantine),
        "candidate_papers": len(candidate_rows),
        "curated_addition_rows": len(read_csv(CURATED_ADDITIONS_PATH)) if CURATED_ADDITIONS_PATH.exists() else 0,
        "source_ids_used": sorted({row.get("source_id") for row in master if row.get("source_id")}),
        "data_status_counts": {
            status: sum(row.get("data_type") == status for row in master)
            for status in ["REAL_EXPERIMENTAL", "DIGITIZED", "DERIVED", "SYNTHETIC"]
        },
        "unit_conversions": [
            "mrr_source_reported_mm3_min_no_conversion",
            "twr_source_reported_mm3_min_no_conversion",
            "S2021_SHIRGUPPIKAR_TI64_AL: MRR g/min to mm3/min using independently verified Ti-6Al-4V Grade 5 density 4.43 g/cm3.",
            "S2021_SHIRGUPPIKAR_TI64_AL: uncoated aluminium TWR g/min to mm3/min using independently verified aluminium density 2.70 g/cm3.",
        ],
        "attached_sources": attached_sources,
        "remaining_unit_definition_problems": [
            "S2024_PAL reports mass-rate MRR/TWR in mg/s; volume conversion needs verified densities and source definition review.",
            "S2020_TOOLSTEEL unit presentation requires source verification before canonical use.",
            "S2025_NDFEB reports MRR in mg/min and no TWR; density/definition verification required before MRR volume conversion.",
            "C2017_IN718_DEEP_HOLE reports EWR; EWR must not be silently converted to TWR.",
            "Attached SS304/aluminium report observations remain in needs_review quarantine pending independently verified material-property records.",
            "S2023_SHIRGUPPIKAR_GRAPHENE response columns contain published numbers but table-unit verification is incomplete; all rows remain quarantined.",
        ],
    }
    write_data_quality_report(stats, source_rows)
    write_data_collection_report(stats, source_rows, candidate_rows)
    write_material_property_report(materials, electrodes)
    return stats


def write_data_quality_report(stats: dict[str, Any], source_rows: list[dict[str, str]]) -> None:
    text = [
        "# EDM Literature Data Quality Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Summary",
        "",
        f"- Total literature rows: {stats['total_literature_rows']}",
        f"- Valid canonical training rows: {stats['training_rows']}",
        f"- Usable MRR training rows: {stats['mrr_training_rows']}",
        f"- Usable TWR training rows: {stats['twr_training_rows']}",
        f"- Source papers in registry: {stats['paper_count']}",
        f"- Source papers with verified canonical training rows: {stats['usable_paper_count']}",
        f"- Quarantined literature rows: {stats['quarantined_rows']}",
        f"- Direct real experimental canonical rows: {stats['data_status_counts']['REAL_EXPERIMENTAL']}",
        f"- Density-derived canonical rows: {stats['data_status_counts']['DERIVED']}",
        "",
        "## Unit Handling",
        "",
        "- MRR/TWR rows are used only when their canonical volumetric `mm3/min` value is directly reported or has a source-specific, documented density conversion.",
        "- EWR/electrode wear ratio and any target with an unresolved definition remain quarantined.",
        "- Missing material/electrode properties remain blank rather than fabricated.",
        "",
        "## Remaining Unit/Definition Problems",
        "",
    ]
    text.extend(f"- {item}" for item in stats["remaining_unit_definition_problems"])
    text.extend(["", "## Source Registry", ""])
    for source in source_rows:
        text.append(f"- `{source.get('source_id')}` ({source.get('year')}): {source.get('title')} | outputs: {source.get('outputs')}")
    text.extend(
        [
            "",
            "## Methodology Gate",
            "",
            "The user's experimental dataset is stored in quarantine and is not used for training, feature selection, or model selection.",
        ]
    )
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTS_DIR / "data_quality_report.md").write_text("\n".join(text), encoding="utf-8")


def write_data_collection_report(stats: dict[str, Any], source_rows: list[dict[str, str]], candidate_rows: list[dict[str, str]]) -> None:
    used_sources = {source.get("source_id") for source in source_rows if source.get("source_id") in set(stats["source_ids_used"])}
    lines = [
        "# EDM Research Data Collection Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Methodology Gate",
        "",
        "- User experimental `Data_sheet.csv` remains quarantined and was not used for training, tuning, feature selection, model selection, preprocessing decisions, or threshold tuning.",
        "- Siddharth Dhobal and Swapnil reports are explicitly excluded from training, validation, feature selection, model selection, tuning, and benchmarking.",
        "- EWR/electrode wear ratio is not treated as TWR unless the source definition explicitly supports a volumetric tool wear rate.",
        "",
        "## Collection Summary",
        "",
        f"- Total research papers in registry: {stats['paper_count']}",
        f"- Additional candidate papers recorded but not imported: {stats['candidate_papers']}",
        f"- Papers actually used in canonical rows: {stats['usable_paper_count']}",
        f"- Curated addition rows added: {stats['curated_addition_rows']}",
        f"- Total experimental rows inspected/imported: {stats['total_literature_rows']}",
        f"- Usable MRR rows: {stats['mrr_training_rows']}",
        f"- Usable TWR rows: {stats['twr_training_rows']}",
        f"- Rows quarantined from literature target conversion: {stats['quarantined_rows']}",
        f"- Real experimental canonical rows: {stats['data_status_counts']['REAL_EXPERIMENTAL']}",
        f"- Derived canonical rows: {stats['data_status_counts']['DERIVED']}",
        f"- Digitized canonical rows: {stats['data_status_counts']['DIGITIZED']}",
        f"- Synthetic canonical rows: {stats['data_status_counts']['SYNTHETIC']}",
        f"- Attached files inspected: {len(stats.get('attached_sources', [])) + 1}",
        "",
        "## Source Coverage",
        "",
    ]
    for source in source_rows:
        marker = "USED" if source.get("source_id") in used_sources else "QUARANTINE_OR_REFERENCE"
        lines.append(
            f"- `{source.get('source_id')}` [{marker}] {source.get('title')} ({source.get('year')}); "
            f"workpiece: {source.get('workpiece')}; electrodes: {source.get('electrodes')}; table: {source.get('table_used')}; units: {source.get('raw_units')}"
        )

    lines.extend(["", "## Attached Report Review", ""])
    for source in stats.get("attached_sources", []):
        lines.append(
            f"- `{source.get('source_id')}` [{source.get('status')}] {source.get('source_file')}: "
            f"{source.get('rows_extracted')} rows extracted; {source.get('notes')}"
        )
    lines.append("- `Report Format _ URE Track AY 2024-25_swap.pdf` [REFERENCE_ONLY]: report formatting template; no experimental observations extracted.")

    lines.extend(["", "## Candidate Sources Not Imported", ""])
    if candidate_rows:
        for row in candidate_rows:
            lines.append(f"- `{row.get('source_id')}` {row.get('title')} ({row.get('year')}): {row.get('status')} - {row.get('reason')}")
    else:
        lines.append("- None recorded.")

    lines.extend(
        [
            "",
            "## Workpiece Materials in Usable Rows",
            "",
            *[f"- {item}" for item in stats["workpiece_materials"]],
            "",
            "## Electrode Materials in Usable Rows",
            "",
            *[f"- {item}" for item in stats["electrode_materials"]],
            "",
            "## Unit Conversions",
            "",
            *[f"- {item}" for item in stats["unit_conversions"]],
            "",
            "## Remaining Problems",
            "",
            *[f"- {item}" for item in stats["remaining_unit_definition_problems"]],
            "",
            "## Training Decision",
            "",
            "The frozen model is trained only on canonical published-literature rows. Siddharth Dhobal, Swapnil, and user experimental observations are not in training, preprocessing, feature selection, model selection, validation, or tuning.",
        ]
    )
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTS_DIR / "data_collection_report.md").write_text("\n".join(lines), encoding="utf-8")


def write_material_property_report(materials: list[dict[str, Any]], electrodes: list[dict[str, Any]]) -> None:
    rows = materials + electrodes
    used_materials = {"Aluminium 6061", "Ti-6Al-4V", "Waspaloy", "Copper", "Brass", "Graphite"}
    training_rows = [row for row in rows if row["material_name"] in used_materials]
    status_counts: dict[str, int] = {}
    for row in training_rows:
        status = str(row.get("validation_status", "missing"))
        status_counts[status] = status_counts.get(status, 0) + 1

    lines = [
        "# Material Property Verification Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Policy",
        "",
        "- Only independently sourced material/electrode properties are placed in `value`.",
        "- Paper-reported values are preserved in `original_source_value` when available.",
        "- Missing, grade-dependent, or condition-dependent values remain blank instead of being guessed.",
        "- Alloy melting ranges and grade-dependent ranges are stored as ranges and must not be forced into scalar ML features without an explicit feature policy.",
        "",
        "## Training-Coverage Property Status",
        "",
    ]
    for status, count in sorted(status_counts.items()):
        lines.append(f"- {status}: {count}")

    lines.extend(["", "## Material Details", ""])
    for material in sorted({row["material_name"] for row in training_rows}):
        lines.append(f"### {material}")
        for row in [item for item in training_rows if item["material_name"] == material]:
            value = row.get("value") or "NULL"
            lines.append(
                f"- {row.get('property')}: {value} {row.get('unit')}; status={row.get('validation_status')}; "
                f"source={row.get('source_id')}; original={row.get('original_source_value') or 'none'}"
            )
        lines.append("")

    lines.extend(
        [
            "## Training Gate",
            "",
            "Do not use material-aware features in final training until blank and low-confidence graphite/copper/brass mechanical properties are either verified for the actual electrode grades or intentionally excluded by a documented feature policy.",
        ]
    )
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTS_DIR / "material_property_report.md").write_text("\n".join(lines), encoding="utf-8")


@dataclass
class Preprocessor:
    numeric_features: list[str]
    categorical_features: list[str]
    numeric_medians: dict[str, float]
    numeric_means: dict[str, float]
    numeric_stds: dict[str, float]
    categories: dict[str, list[str]]

    def transform(self, rows: list[dict[str, Any]]) -> np.ndarray:
        matrix: list[list[float]] = []
        for row in rows:
            enriched = add_derived_features(dict(row))
            values: list[float] = []
            for feature in self.numeric_features:
                number = as_float(enriched.get(feature))
                if number is None:
                    number = self.numeric_medians[feature]
                std = self.numeric_stds[feature] or 1.0
                values.append((number - self.numeric_means[feature]) / std)
            for feature in self.categorical_features:
                value = str(enriched.get(feature, "") or "")
                values.extend(1.0 if value == category else 0.0 for category in self.categories[feature])
            matrix.append(values)
        return np.asarray(matrix, dtype=float)

    def to_dict(self) -> dict[str, Any]:
        return {
            "numeric_features": self.numeric_features,
            "categorical_features": self.categorical_features,
            "numeric_medians": self.numeric_medians,
            "numeric_means": self.numeric_means,
            "numeric_stds": self.numeric_stds,
            "categories": self.categories,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Preprocessor":
        return cls(
            numeric_features=list(data["numeric_features"]),
            categorical_features=list(data["categorical_features"]),
            numeric_medians={key: float(value) for key, value in data["numeric_medians"].items()},
            numeric_means={key: float(value) for key, value in data["numeric_means"].items()},
            numeric_stds={key: float(value) for key, value in data["numeric_stds"].items()},
            categories={key: list(value) for key, value in data["categories"].items()},
        )


def add_derived_features(row: dict[str, Any]) -> dict[str, Any]:
    current = as_float(row.get("current_A"))
    voltage = as_float(row.get("voltage_V"))
    ton = as_float(row.get("ton_us"))
    toff = as_float(row.get("toff_us"))
    row["power_proxy"] = current * voltage if current is not None and voltage is not None else ""
    row["current_ton_proxy"] = current * ton if current is not None and ton is not None else ""
    row["voltage_ton_proxy"] = voltage * ton if voltage is not None and ton is not None else ""
    row["pulse_energy_proxy"] = current * voltage * ton if current is not None and voltage is not None and ton is not None else ""
    row["duty_cycle"] = row.get("duty_cycle") if as_float(row.get("duty_cycle")) is not None else duty_cycle(ton, toff)
    return row


def fit_preprocessor(
    rows: list[dict[str, Any]],
    numeric_features: list[str] | None = None,
    categorical_features: list[str] | None = None,
) -> Preprocessor:
    numeric_features = numeric_features or NUMERIC_FEATURES
    categorical_features = categorical_features or CATEGORICAL_FEATURES
    medians: dict[str, float] = {}
    means: dict[str, float] = {}
    stds: dict[str, float] = {}
    enriched_rows = [add_derived_features(dict(row)) for row in rows]
    for feature in numeric_features:
        values = [as_float(row.get(feature)) for row in enriched_rows]
        clean = np.asarray([value for value in values if value is not None], dtype=float)
        if clean.size == 0:
            medians[feature] = 0.0
            means[feature] = 0.0
            stds[feature] = 1.0
        else:
            medians[feature] = float(np.median(clean))
            means[feature] = float(np.mean(clean))
            std = float(np.std(clean))
            stds[feature] = std if std > 1e-12 else 1.0
    categories = {
        feature: sorted({str(row.get(feature, "") or "") for row in enriched_rows})
        for feature in categorical_features
    }
    return Preprocessor(numeric_features, categorical_features, medians, means, stds, categories)


def design_matrix(x: np.ndarray, model_type: str) -> np.ndarray:
    intercept = np.ones((x.shape[0], 1))
    if model_type == "polynomial_ridge":
        squares = x * x
        return np.hstack([intercept, x, squares])
    return np.hstack([intercept, x])


def fit_weights(x: np.ndarray, y: np.ndarray, alpha: float) -> np.ndarray:
    xtx = x.T @ x
    penalty = np.eye(xtx.shape[0]) * alpha
    penalty[0, 0] = 0.0
    return np.linalg.pinv(xtx + penalty) @ x.T @ y


def predict_weights(x: np.ndarray, weights: np.ndarray) -> np.ndarray:
    return x @ weights


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    errors = y_true - y_pred
    abs_errors = np.abs(errors)
    denom = np.where(np.abs(y_true) < 1e-12, np.nan, np.abs(y_true))
    ape = abs_errors / denom * 100.0
    ss_res = float(np.sum(errors**2))
    ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
    return {
        "mae": float(np.mean(abs_errors)),
        "rmse": float(np.sqrt(np.mean(errors**2))),
        "mape": float(np.nanmean(ape)),
        "r2": float(1.0 - ss_res / ss_tot) if ss_tot > 1e-12 else 0.0,
        "median_ape": float(np.nanmedian(ape)),
        "max_ape": float(np.nanmax(ape)),
    }


def train_test_split(n: int, seed: int = 42) -> tuple[list[int], list[int]]:
    indices = list(range(n))
    random.Random(seed).shuffle(indices)
    test_size = max(1, round(n * 0.2))
    return indices[test_size:], indices[:test_size]


def fit_predict_for_split(
    train_rows: list[dict[str, Any]],
    test_rows: list[dict[str, Any]],
    target: str,
    model_type: str,
    alpha: float,
    numeric_features: list[str],
    categorical_features: list[str],
) -> tuple[np.ndarray, np.ndarray]:
    preprocessor = fit_preprocessor(train_rows, numeric_features, categorical_features)
    x_train = design_matrix(preprocessor.transform(train_rows), model_type)
    y_train = np.asarray([as_float(row[target]) for row in train_rows], dtype=float)
    x_test = design_matrix(preprocessor.transform(test_rows), model_type)
    y_test = np.asarray([as_float(row[target]) for row in test_rows], dtype=float)
    weights = fit_weights(x_train, y_train, alpha)
    return y_test, predict_weights(x_test, weights)


def evaluate_random_split(
    usable: list[dict[str, Any]],
    target: str,
    model_type: str,
    alpha: float,
    numeric_features: list[str],
    categorical_features: list[str],
) -> dict[str, Any]:
    train_idx, test_idx = train_test_split(len(usable))
    train_rows = [usable[index] for index in train_idx]
    test_rows = [usable[index] for index in test_idx]
    y_true, predicted = fit_predict_for_split(train_rows, test_rows, target, model_type, alpha, numeric_features, categorical_features)
    result = metrics(y_true, predicted)
    result["validation_samples"] = len(test_rows)
    result["groups"] = 0
    return result


def group_value(row: dict[str, Any], group_key: str) -> str:
    if group_key == "material_electrode":
        return f"{row.get('workpiece_material', '')}|{row.get('electrode_material', '')}"
    return str(row.get(group_key, "") or "")


def evaluate_grouped_split(
    usable: list[dict[str, Any]],
    target: str,
    model_type: str,
    alpha: float,
    numeric_features: list[str],
    categorical_features: list[str],
    group_key: str,
) -> dict[str, Any]:
    groups = sorted({group_value(row, group_key) for row in usable if group_value(row, group_key)})
    if len(groups) < 2:
        return {"status": "unavailable", "reason": f"Requires at least 2 groups; found {len(groups)}.", "groups": groups}

    y_true_all: list[float] = []
    y_pred_all: list[float] = []
    used_groups = 0
    for group in groups:
        train_rows = [row for row in usable if group_value(row, group_key) != group]
        test_rows = [row for row in usable if group_value(row, group_key) == group]
        if len(train_rows) < 5 or not test_rows:
            continue
        y_true, predicted = fit_predict_for_split(train_rows, test_rows, target, model_type, alpha, numeric_features, categorical_features)
        y_true_all.extend(y_true.tolist())
        y_pred_all.extend(predicted.tolist())
        used_groups += 1

    if used_groups < 2 or not y_true_all:
        return {"status": "unavailable", "reason": "Not enough trainable folds after grouping.", "groups": groups}

    result = metrics(np.asarray(y_true_all, dtype=float), np.asarray(y_pred_all, dtype=float))
    result["validation_samples"] = len(y_true_all)
    result["groups"] = used_groups
    result["status"] = "ok"
    return result


def evaluate_candidate(
    rows: list[dict[str, Any]],
    target: str,
    model_type: str,
    alpha: float,
    config_id: str,
) -> dict[str, Any]:
    config = MODEL_CONFIGS[config_id]
    numeric_features = list(config["numeric_features"])
    categorical_features = list(config["categorical_features"])
    usable = complete_model_rows(rows, target, numeric_features, categorical_features)
    if len(usable) < 5:
        return {"model": model_type, "alpha": alpha, "config": config_id, "status": "insufficient_rows"}
    return {
        "model": model_type,
        "alpha": alpha,
        "config": config_id,
        "config_label": config["label"],
        "status": "ok",
        "random_split": evaluate_random_split(usable, target, model_type, alpha, numeric_features, categorical_features),
        "grouped_by_source": evaluate_grouped_split(usable, target, model_type, alpha, numeric_features, categorical_features, "source_id"),
        "grouped_by_material_electrode": evaluate_grouped_split(usable, target, model_type, alpha, numeric_features, categorical_features, "material_electrode"),
        "leave_one_material_out": evaluate_grouped_split(usable, target, model_type, alpha, numeric_features, categorical_features, "workpiece_material"),
        "validation_samples": len(usable),
    }


def complete_model_rows(
    rows: list[dict[str, Any]],
    target: str,
    numeric_features: list[str],
    categorical_features: list[str],
) -> list[dict[str, Any]]:
    """Keep only observations that contain every selected measured feature.

    Missing process variables are a source-data limitation, not a value to
    invent with median imputation. The preprocessor may still support a blank
    optional field at prediction time, but no incomplete observation trains the
    frozen model.
    """
    return [
        row
        for row in rows
        if as_float(row.get(target)) is not None
        and all(as_float(row.get(feature)) is not None for feature in numeric_features)
        and all(str(row.get(feature, "") or "").strip() for feature in categorical_features)
    ]


def select_and_fit(rows: list[dict[str, Any]], target: str) -> dict[str, Any]:
    candidates = [
        ("linear_regression", 0.0, "research_supported_core"),
        ("ridge_regression", 0.1, "research_supported_core"),
        ("ridge_regression", 1.0, "research_supported_core"),
        ("ridge_regression", 10.0, "research_supported_core"),
        ("polynomial_ridge", 1.0, "research_supported_core"),
        ("polynomial_ridge", 10.0, "research_supported_core"),
    ]
    results = [evaluate_candidate(rows, target, model, alpha, config_id) for model, alpha, config_id in candidates]
    ok_results = [result for result in results if result.get("status") == "ok"]
    # Percentage error is unstable for the near-zero TWR observations. Select
    # with source-held-out absolute error first, then RMSE, so the frozen model
    # is chosen by the requested grouped validation without rewarding a tiny
    # denominator.
    selected = min(
        ok_results,
        key=lambda item: (
            item["grouped_by_source"]["mae"] if item["grouped_by_source"].get("status") == "ok" else float("inf"),
            item["grouped_by_source"]["rmse"] if item["grouped_by_source"].get("status") == "ok" else float("inf"),
            item["random_split"]["mae"],
            item["random_split"]["rmse"],
        ),
    ) if ok_results else results[0]
    config = MODEL_CONFIGS[str(selected["config"])]
    numeric_features = list(config["numeric_features"])
    categorical_features = list(config["categorical_features"])
    usable = complete_model_rows(rows, target, numeric_features, categorical_features)
    preprocessor = fit_preprocessor(usable, numeric_features, categorical_features)
    x = design_matrix(preprocessor.transform(usable), selected["model"])
    y = np.asarray([as_float(row[target]) for row in usable], dtype=float)
    weights = fit_weights(x, y, float(selected["alpha"]))
    fit_pred = predict_weights(x, weights)
    return {
        "target": target,
        "selected": selected,
        "candidates": results,
        "unavailable_candidates": [
            {"model": "Random Forest", "reason": "scikit-learn is not installed in the local runtime."},
            {"model": "Extra Trees", "reason": "scikit-learn is not installed in the local runtime."},
            {"model": "Gradient Boosting", "reason": "scikit-learn is not installed in the local runtime."},
            {"model": "HistGradientBoosting", "reason": "scikit-learn is not installed in the local runtime."},
            {"model": "SVR", "reason": "scikit-learn is not installed in the local runtime."},
            {"model": "MLP", "reason": "scikit-learn is not installed in the local runtime and 84 rows is small for ANN claims."},
            {"model": "XGBoost", "reason": "xgboost is not installed in the local runtime."},
        ],
        "preprocessor": preprocessor.to_dict(),
        "model": {
            "model_type": selected["model"],
            "alpha": selected["alpha"],
            "config": selected["config"],
            "config_label": selected["config_label"],
            "weights": weights.tolist(),
            "training_fit_metrics": metrics(y, fit_pred),
        },
        "domain": build_domain(usable, numeric_features, categorical_features),
        "row_count": len(usable),
        "source_ids": sorted({str(row.get("source_id", "")) for row in usable if row.get("source_id")}),
        "materials": sorted({str(row.get("workpiece_material", "")) for row in usable if row.get("workpiece_material")}),
        "electrodes": sorted({str(row.get("electrode_material", "")) for row in usable if row.get("electrode_material")}),
    }


def build_domain(rows: list[dict[str, Any]], numeric_features: list[str], categorical_features: list[str]) -> dict[str, Any]:
    domain: dict[str, Any] = {"numeric": {}, "categorical": {}, "material_electrode_combinations": {}, "by_combination": {}}
    enriched = [add_derived_features(dict(row)) for row in rows]
    for feature in numeric_features:
        values = [as_float(row.get(feature)) for row in enriched]
        clean = [value for value in values if value is not None]
        if clean:
            domain["numeric"][feature] = {"min": min(clean), "max": max(clean)}
    for feature in categorical_features:
        domain["categorical"][feature] = sorted({str(row.get(feature, "") or "") for row in enriched})
    for combo in sorted({group_value(row, "material_electrode") for row in enriched}):
        combo_rows = [row for row in enriched if group_value(row, "material_electrode") == combo]
        domain["material_electrode_combinations"][combo] = len(combo_rows)
        domain["by_combination"][combo] = {}
        for feature in numeric_features:
            clean = [as_float(row.get(feature)) for row in combo_rows if as_float(row.get(feature)) is not None]
            if clean:
                domain["by_combination"][combo][feature] = {"min": min(clean), "max": max(clean)}
    return domain


def observed_input_ranges(rows: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    ranges: dict[str, dict[str, float]] = {}
    for feature in ["current_A", "voltage_V", "ton_us", "toff_us", "electrode_rotation_rpm"]:
        values = [as_float(row.get(feature)) for row in rows]
        clean = [value for value in values if value is not None]
        if clean:
            ranges[feature] = {"min": min(clean), "max": max(clean)}
    return ranges


def save_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def train_models() -> dict[str, Any]:
    mrr_rows = read_csv(PROCESSED_DIR / "mrr_training_dataset.csv")
    twr_rows = read_csv(PROCESSED_DIR / "twr_training_dataset.csv")
    mrr = select_and_fit(mrr_rows, "mrr")
    twr = select_and_fit(twr_rows, "twr")
    save_json(MODELS_DIR / "mrr_model.joblib", mrr)
    save_json(MODELS_DIR / "twr_model.joblib", twr)
    save_json(MODELS_DIR / "preprocessor.joblib", {"mrr": mrr["preprocessor"], "twr": twr["preprocessor"]})
    metadata = {
        "model_version": MODEL_VERSION,
        "training_dataset_version": DATASET_VERSION,
        "source_count": len(set(mrr["source_ids"]) | set(twr["source_ids"])),
        "row_count": max(mrr["row_count"], twr["row_count"]),
        "mrr_row_count": mrr["row_count"],
        "twr_row_count": twr["row_count"],
        "materials": sorted(set(mrr["materials"]) & set(twr["materials"])),
        "electrodes": sorted(set(mrr["electrodes"]) & set(twr["electrodes"])),
        "process_features": PRIMARY_PROCESS_FEATURES,
        "material_features": [],
        "categorical_features": PRIMARY_CATEGORICAL_FEATURES,
        "input_observation_ranges": observed_input_ranges(mrr_rows),
        "features": sorted(set(mrr["preprocessor"]["numeric_features"] + mrr["preprocessor"]["categorical_features"] + twr["preprocessor"]["numeric_features"] + twr["preprocessor"]["categorical_features"])),
        "validation_method": {
            "random_split": "80/20 diagnostic, fixed seed 42",
            "primary": "Leave-one-source-out grouped validation by paper/source",
            "grouped_by_material_electrode": "Leave-one-material/electrode-combination-out where trainable",
            "leave_one_material_out": "Leave-one-workpiece-material-out where trainable",
        },
        "metrics": {
            "mrr": mrr["selected"],
            "twr": twr["selected"],
        },
        "target_units": {"mrr": "mm3/min", "twr": "mm3/min"},
        "selected_models": {
            "mrr": mrr["model"],
            "twr": twr["model"],
        },
        "training_date": datetime.now(timezone.utc).isoformat(),
        "scientific_status": "exploratory_research_guidance_only_source_group_validation_does_not_support_cross_paper_generalization",
        "limitations": [
            "The primary model excludes rows missing Current, Voltage, or TON rather than imputing process variables.",
            "TOFF, rotation, dielectric, coating, and reference material properties are retained as provenance/context, not model features, because they are incomplete or confounded across source groups.",
            "Leave-one-source-out diagnostics are poor; this artifact must not be presented as a general cross-paper or production prediction model.",
            "User experimental Data_sheet.csv remains quarantined and was not used.",
            "scikit-learn, xgboost, joblib, and shap were unavailable in the bundled local runtime; dependency-free regression candidates were evaluated.",
        ],
    }
    save_json(MODELS_DIR / "model_metadata.json", metadata)
    write_model_reports(mrr, twr, metadata)
    return metadata


def write_model_reports(mrr: dict[str, Any], twr: dict[str, Any], metadata: dict[str, Any]) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    def metric_value(result: dict[str, Any], split: str, key: str) -> str:
        data = result.get(split, {})
        if data.get("status") == "unavailable":
            return "n/a"
        value = data.get(key)
        return f"{value:.4g}" if isinstance(value, (int, float)) and math.isfinite(value) else "n/a"

    table_lines = [
        "| Model | Config | Target | Random MAPE | Grouped MAPE | Random R2 | Grouped R2 | MAE | RMSE |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|",
    ]
    for target_name, bundle in [("MRR", mrr), ("TWR", twr)]:
        for result in bundle["candidates"]:
            if result.get("status") != "ok":
                continue
            table_lines.append(
                "| "
                + " | ".join(
                    [
                        str(result["model"]),
                        str(result["config"]),
                        target_name,
                        metric_value(result, "random_split", "mape"),
                        metric_value(result, "grouped_by_source", "mape"),
                        metric_value(result, "random_split", "r2"),
                        metric_value(result, "grouped_by_source", "r2"),
                        metric_value(result, "grouped_by_source", "mae"),
                        metric_value(result, "grouped_by_source", "rmse"),
                    ]
                )
                + " |"
            )

    lines = [
        "# Model Comparison",
        "",
        "Training data: published research rows with verified canonical volumetric targets only.",
        "",
        "Small literature dataset. Source-group holdouts are poor, so this artifact is exploratory in-domain research guidance, not a validated cross-paper or production predictor.",
        "",
        "## Candidate Models",
        "",
        "Implemented locally without scikit-learn: linear regression, ridge regression, polynomial ridge.",
        "Unavailable in the bundled runtime: Random Forest, Extra Trees, Gradient Boosting, HistGradientBoosting, SVR, MLP, XGBoost, SHAP.",
        "",
        "## Validation Summary",
        "",
        *table_lines,
        "",
        "## Selected Models",
        "",
        f"- Exploratory MRR artifact: `{mrr['model']['model_type']}` / `{mrr['model']['config']}`. It is the least-poor available grouped-source candidate, not a validated generalization model.",
        f"- Exploratory TWR artifact: `{twr['model']['model_type']}` / `{twr['model']['config']}`. It is the least-poor available grouped-source candidate, not a validated generalization model.",
        "",
        "## MRR Candidate Details",
        "",
    ]
    for result in mrr["candidates"]:
        lines.append(f"- {result}")
    lines.extend(["", "## TWR Candidate Details", ""])
    for result in twr["candidates"]:
        lines.append(f"- {result}")
    lines.extend(["", "## Unavailable Candidate Families", ""])
    for result in mrr["unavailable_candidates"]:
        lines.append(f"- {result['model']}: {result['reason']}")
    (REPORTS_DIR / "model_comparison.md").write_text("\n".join(lines), encoding="utf-8")
    comparison_rows: list[dict[str, Any]] = []
    for target_name, bundle in [("MRR", mrr), ("TWR", twr)]:
        selected = bundle["selected"]
        for candidate in bundle["candidates"]:
            if candidate.get("status") != "ok":
                continue
            grouped = candidate.get("grouped_by_source", {})
            comparison_rows.append(
                {
                    "Model": candidate.get("model"),
                    "Target": target_name,
                    "Features": "; ".join(MODEL_CONFIGS[candidate["config"]]["numeric_features"] + MODEL_CONFIGS[candidate["config"]]["categorical_features"]),
                    "MAE": grouped.get("mae", ""),
                    "RMSE": grouped.get("rmse", ""),
                    "R2": grouped.get("r2", ""),
                    "Validation_Method": "leave-one-source-out grouped validation",
                    "Selected": candidate.get("model") == selected.get("model") and candidate.get("alpha") == selected.get("alpha"),
                }
            )
    write_csv(
        REPORTS_DIR / "model_comparison.csv",
        comparison_rows,
        ["Model", "Target", "Features", "MAE", "RMSE", "R2", "Validation_Method", "Selected"],
    )

    grouped = [
        "# Grouped Validation",
        "",
        "Grouped validation was requested and completed before model freeze wherever enough groups existed.",
        "",
        "## Selected MRR",
        "",
        f"- Source grouped: {mrr['selected']['grouped_by_source']}",
        f"- Material/electrode grouped: {mrr['selected']['grouped_by_material_electrode']}",
        f"- Leave-one-material-out: {mrr['selected']['leave_one_material_out']}",
        "",
        "## Selected TWR",
        "",
        f"- Source grouped: {twr['selected']['grouped_by_source']}",
        f"- Material/electrode grouped: {twr['selected']['grouped_by_material_electrode']}",
        f"- Leave-one-material-out: {twr['selected']['leave_one_material_out']}",
        "",
        "Interpretation: these are literature-only grouped diagnostics, not independent experimental validation. Negative source-group R2 means a model trained on one paper does not reliably transfer to the other source; the browser artifact is therefore restricted to exploratory, directly represented combinations.",
    ]
    (REPORTS_DIR / "grouped_validation.md").write_text("\n".join(grouped), encoding="utf-8")

    canonical_mrr = read_csv(PROCESSED_DIR / "mrr_training_dataset.csv")
    canonical_twr = read_csv(PROCESSED_DIR / "twr_training_dataset.csv")
    quarantined = read_csv(QUARANTINE_DIR / "unverified_literature_rows.csv")
    audit = [
        "# Final Research ML Audit",
        "",
        "## Evidence Gate",
        "",
        "The user experimental `Data_sheet.csv`, Siddharth Dhobal report, and Swapnil report are excluded. None was used for training, tuning, preprocessing, feature selection, candidate selection, validation, or benchmarks.",
        "",
        "## Canonical Targets",
        "",
        f"- MRR: {len(canonical_mrr)} canonical volumetric `mm3/min` observations (directly reported or documented density-derived).",
        f"- TWR: {len(canonical_twr)} canonical volumetric `mm3/min` observations (directly reported or documented density-derived).",
        f"- Quarantined literature targets: {len(quarantined)} (mass-rate or ambiguous/unsupported definitions).",
        "- No EWR/electrode-wear-ratio observation is converted to TWR.",
        "",
        "## Primary Model Cohort",
        "",
        f"- Rows with all selected predictors and MRR: {metadata['mrr_row_count']}.",
        f"- Rows with all selected predictors and TWR: {metadata['twr_row_count']}.",
        f"- Source groups: {metadata['source_count']}.",
        f"- Workpieces: {', '.join(metadata['materials'])}.",
        f"- Electrodes: {', '.join(metadata['electrodes'])}.",
        f"- Features: {', '.join(metadata['process_features'] + metadata['categorical_features'])}.",
        "- Material-property reference values are retained for provenance and display only; they are not training features.",
        "",
        "## Validation Decision",
        "",
        "- Candidate selection used leave-one-source-out diagnostics where trainable, with random split retained only as a diagnostic.",
        f"- Selected MRR source-group R2: {mrr['selected']['grouped_by_source'].get('r2', 'n/a')}.",
        f"- Selected TWR source-group R2: {twr['selected']['grouped_by_source'].get('r2', 'n/a')}.",
        "- These source-group results are insufficient to claim cross-paper generalization, high accuracy, or production readiness.",
        "- The browser artifact is exported only as explicitly labelled exploratory research guidance for directly represented combinations and observed process bounds.",
        "",
        "## No Synthetic Expansion",
        "",
        "No synthetic observations were generated or used.",
    ]
    (REPORTS_DIR / "final_research_audit.md").write_text("\n".join(audit), encoding="utf-8")

    def coefficient_importance(bundle: dict[str, Any]) -> list[tuple[str, float]]:
        preprocessor = Preprocessor.from_dict(bundle["preprocessor"])
        names = ["intercept"]
        names.extend(preprocessor.numeric_features)
        for feature in preprocessor.categorical_features:
            names.extend(f"{feature}={category}" for category in preprocessor.categories[feature])
        if bundle["model"]["model_type"] == "polynomial_ridge":
            base = names[1:]
            names.extend(f"{name}^2" for name in base)
        weights = [abs(float(value)) for value in bundle["model"]["weights"]]
        pairs = list(zip(names, weights))
        return sorted(pairs[1:], key=lambda item: item[1], reverse=True)[:15]

    feature_lines = [
        "# Feature Importance",
        "",
        "For the selected linear/ridge-family models, standardized coefficient magnitude is reported as a diagnostic. This is not SHAP and must not be interpreted as physical causality.",
        "",
        "Tree-model feature importance and SHAP were not run because scikit-learn/xgboost/shap are not installed in the local runtime.",
        "",
        "## MRR Top Coefficients",
        "",
    ]
    feature_lines.extend(f"- {name}: {value:.4g}" for name, value in coefficient_importance(mrr))
    feature_lines.extend(["", "## TWR Top Coefficients", ""])
    feature_lines.extend(f"- {name}: {value:.4g}" for name, value in coefficient_importance(twr))
    (REPORTS_DIR / "feature_importance.md").write_text("\n".join(feature_lines), encoding="utf-8")

    validation = [
        "# Experimental Validation",
        "",
        "Training data: Published research only.",
        "",
        "Testing data: User independent experimental dataset.",
        "",
        "Status: not executed automatically because the quarantined user dataset lacks reliable material/electrode identifiers. Use the `/validate` endpoint after supplying workpiece and electrode context. The frozen model must not be retrained during validation.",
    ]
    (REPORTS_DIR / "experimental_validation.md").write_text("\n".join(validation), encoding="utf-8")


def load_model_bundle() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    return load_json(MODELS_DIR / "mrr_model.joblib"), load_json(MODELS_DIR / "twr_model.joblib"), load_json(MODELS_DIR / "model_metadata.json")


def enrich_prediction_row(row: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(row)
    if (PROCESSED_DIR / "materials.csv").exists() and (PROCESSED_DIR / "electrodes.csv").exists():
        materials = read_csv(PROCESSED_DIR / "materials.csv")
        electrodes = read_csv(PROCESSED_DIR / "electrodes.csv")
        material = normalize_material(str(enriched.get("workpiece_material", "")))
        electrode = normalize_material(str(enriched.get("electrode_material", "")))
        for prop, value in material_property_index(materials, "workpiece").get(material, {}).items():
            enriched[f"workpiece_{prop}"] = value
        for prop, value in material_property_index(electrodes, "electrode").get(electrode, {}).items():
            enriched[f"electrode_{prop}"] = value
    enriched["workpiece_material"] = normalize_material(str(enriched.get("workpiece_material", "")))
    enriched["electrode_material"] = normalize_material(str(enriched.get("electrode_material", "")))
    return enriched


def predict_target(model_bundle: dict[str, Any], row: dict[str, Any]) -> float:
    preprocessor = Preprocessor.from_dict(model_bundle["preprocessor"])
    x = design_matrix(preprocessor.transform([row]), model_bundle["model"]["model_type"])
    weights = np.asarray(model_bundle["model"]["weights"], dtype=float)
    return float(predict_weights(x, weights)[0])


def domain_check(model_bundle: dict[str, Any], row: dict[str, Any]) -> tuple[str, list[str]]:
    warnings: list[str] = []
    domain = model_bundle["domain"]
    combo = group_value(row, "material_electrode")
    if combo not in domain.get("material_electrode_combinations", {}):
        warnings.append("Workpiece/electrode combination is not represented in the literature training data.")
    for feature, bounds in domain.get("numeric", {}).items():
        value = as_float(add_derived_features(dict(row)).get(feature))
        if value is None:
            continue
        if value < bounds["min"] or value > bounds["max"]:
            warnings.append(f"{feature}={value} is outside validated training range [{bounds['min']}, {bounds['max']}].")
    for feature, allowed in domain.get("categorical", {}).items():
        value = str(row.get(feature, "") or "")
        if allowed and value not in allowed:
            warnings.append(f"{feature}={value or 'blank'} was not present in the verified training data.")
    return ("limited" if warnings else "in_domain"), warnings


def predict(row: dict[str, Any]) -> dict[str, Any]:
    row = enrich_prediction_row(row)
    mrr_model, twr_model, metadata = load_model_bundle()
    mrr_status, mrr_warnings = domain_check(mrr_model, row)
    twr_status, twr_warnings = domain_check(twr_model, row)
    warnings = list(dict.fromkeys(mrr_warnings + twr_warnings))
    raw_mrr = predict_target(mrr_model, row)
    raw_twr = predict_target(twr_model, row)
    if raw_mrr < 0:
        warnings.append("The MRR regression produced an unphysical negative estimate. No MRR value is reported.")
    if raw_twr < 0:
        warnings.append("The TWR regression produced an unphysical negative estimate. No TWR value is reported.")
    return {
        "predicted_mrr": raw_mrr if raw_mrr >= 0 else None,
        "predicted_twr": raw_twr if raw_twr >= 0 else None,
        "mrr_unit": "mm3/min",
        "twr_unit": metadata.get("target_units", {}).get("twr", "mm3/min"),
        "model_version": metadata["model_version"],
        "domain_status": "limited" if mrr_status == "limited" or twr_status == "limited" or raw_mrr < 0 or raw_twr < 0 else "in_domain",
        "warnings": warnings,
    }


def optimize(input_row: dict[str, Any], bounds: dict[str, tuple[float, float]], weights: dict[str, float]) -> dict[str, Any]:
    mrr_model, _twr_model, _metadata = load_model_bundle()
    input_row = enrich_prediction_row(input_row)
    combo = group_value(input_row, "material_electrode")
    combo_domain = mrr_model.get("domain", {}).get("by_combination", {}).get(combo)
    if not combo_domain:
        return {
            "recommended_current_A": None,
            "recommended_voltage_V": None,
            "recommended_ton_us": None,
            "recommended_toff_us": None,
            "predicted_mrr": None,
            "predicted_twr": None,
            "optimization_score": 0,
            "domain_status": "limited",
            "warnings": [f"No validated training range exists for material/electrode combination {combo}."],
        }

    grids = []
    for key in ["current_A", "voltage_V", "ton_us", "toff_us"]:
        requested_low, requested_high = bounds[key]
        validated = combo_domain.get(key) or mrr_model.get("domain", {}).get("numeric", {}).get(key)
        if validated:
            low = max(float(requested_low), float(validated["min"]))
            high = min(float(requested_high), float(validated["max"]))
        else:
            low, high = requested_low, requested_high
        if low > high:
            return {
                "recommended_current_A": None,
                "recommended_voltage_V": None,
                "recommended_ton_us": None,
                "recommended_toff_us": None,
                "predicted_mrr": None,
                "predicted_twr": None,
                "optimization_score": 0,
                "domain_status": "out_of_domain",
                "warnings": [f"Requested {key} range does not overlap validated range for {combo}."],
            }
        grids.append(np.linspace(low, high, 7))
    candidates = []
    limited_candidates = []
    rejected_warnings: list[str] = []
    for current, voltage, ton, toff in itertools.product(*grids):
        row = dict(input_row)
        row.update({"current_A": float(current), "voltage_V": float(voltage), "ton_us": float(ton), "toff_us": float(toff)})
        pred = predict(row)
        if pred["domain_status"] == "in_domain" and pred["predicted_mrr"] is not None and pred["predicted_twr"] is not None:
            candidates.append((row, pred))
        elif pred["domain_status"] == "limited" and pred["predicted_mrr"] is not None and pred["predicted_twr"] is not None:
            limited_candidates.append((row, pred))
            rejected_warnings.extend(pred.get("warnings", []))
        else:
            rejected_warnings.extend(pred.get("warnings", []))
    domain_status = "in_domain"
    if not candidates:
        candidates = limited_candidates
        domain_status = "limited"
    if not candidates:
        return {
            "recommended_current_A": None,
            "recommended_voltage_V": None,
            "recommended_ton_us": None,
            "recommended_toff_us": None,
            "predicted_mrr": None,
            "predicted_twr": None,
            "optimization_score": 0,
            "domain_status": "out_of_domain",
            "warnings": list(dict.fromkeys(rejected_warnings))[:6] or ["No in-domain optimization candidates were found."],
        }
    mrr_values = [item[1]["predicted_mrr"] for item in candidates]
    twr_values = [item[1]["predicted_twr"] for item in candidates]
    min_mrr, max_mrr = min(mrr_values), max(mrr_values)
    min_twr, max_twr = min(twr_values), max(twr_values)

    def scale(value: float, low: float, high: float, invert: bool = False) -> float:
        if high == low:
            return 0.5
        score = (value - low) / (high - low)
        return 1 - score if invert else score

    ranked = []
    for row, pred in candidates:
        mrr_score = scale(pred["predicted_mrr"], min_mrr, max_mrr)
        twr_score = scale(pred["predicted_twr"], min_twr, max_twr, True)
        total = weights.get("mrr", 0.5) * mrr_score + weights.get("twr", 0.5) * twr_score
        ranked.append((total, row, pred))
    best_score, best_row, best_pred = max(ranked, key=lambda item: item[0])
    return {
        "recommended_current_A": best_row["current_A"],
        "recommended_voltage_V": best_row["voltage_V"],
        "recommended_ton_us": best_row["ton_us"],
        "recommended_toff_us": best_row["toff_us"],
        "predicted_mrr": best_pred["predicted_mrr"],
        "predicted_twr": best_pred["predicted_twr"],
        "optimization_score": best_score * 100,
        "domain_status": domain_status,
        "warnings": best_pred["warnings"] if domain_status == "limited" else best_pred["warnings"],
    }


def property_table(path: Path) -> dict[str, dict[str, Any]]:
    rows = read_csv(path)
    table: dict[str, dict[str, Any]] = {}
    for row in rows:
        material = row["material_name"]
        table.setdefault(material, {"material_name": material, "properties": []})["properties"].append(row)
    return table


def source_summary(source_ids: set[str] | None = None) -> list[dict[str, Any]]:
    registry_path = SOURCES_DIR / "merged_source_registry.csv"
    training_path = PROCESSED_DIR / "master_training_dataset.csv"
    registry = read_csv(registry_path) if registry_path.exists() else []
    training_rows = read_csv(training_path) if training_path.exists() else []
    used_counts: dict[str, int] = {}
    for row in training_rows:
        source_id = row.get("source_id", "")
        if source_id and (source_ids is None or source_id in source_ids):
            used_counts[source_id] = used_counts.get(source_id, 0) + 1
    sources = []
    for row in registry:
        source_id = row.get("source_id", "")
        if source_id not in used_counts:
            continue
        sources.append(
            {
                "source_id": source_id,
                "title": row.get("title", ""),
                "year": row.get("year", ""),
                "doi": row.get("doi", ""),
                "url": row.get("url", ""),
                "workpiece": normalize_material(row.get("workpiece", "")),
                "electrodes": row.get("electrodes", ""),
                "observations_used": used_counts[source_id],
                "table_used": row.get("table_used", ""),
            }
        )
    return sources


def model_info() -> dict[str, Any]:
    metadata = load_json(MODELS_DIR / "model_metadata.json")
    mrr = load_json(MODELS_DIR / "mrr_model.joblib")
    twr = load_json(MODELS_DIR / "twr_model.joblib")
    primary_source_ids = set(mrr.get("source_ids", [])) | set(twr.get("source_ids", []))
    return {
        **metadata,
        "training_label": "Training = Published Research",
        "testing_label": "Testing = User Experimental Data",
        "sources": source_summary(primary_source_ids),
    }


def build_all(package_zip: Path, train: bool = False) -> dict[str, Any]:
    stats = build_processed_dataset(package_zip)
    if not train:
        return {
            "data": stats,
            "metadata": None,
            "training_status": "deferred_until_data_collection_report_is_approved",
        }
    metadata = train_models()
    return {"data": stats, "metadata": metadata, "training_status": "trained"}
