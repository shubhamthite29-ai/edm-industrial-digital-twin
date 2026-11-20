"""Export the frozen research models as a static artifact for browser inference."""

from __future__ import annotations

import json
import hashlib
from pathlib import Path

from .ml_engine import MODELS_DIR, PROCESSED_DIR, load_json, property_table, source_summary


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "src" / "data" / "ml" / "frozen-research-model.json"


def main() -> None:
    mrr_model = load_json(MODELS_DIR / "mrr_model.joblib")
    twr_model = load_json(MODELS_DIR / "twr_model.joblib")
    primary_source_ids = set(mrr_model.get("source_ids", [])) | set(twr_model.get("source_ids", []))
    bundle = {
        "schema_version": "edm-browser-inference-v1",
        "mrr_model": mrr_model,
        "twr_model": twr_model,
        "metadata": load_json(MODELS_DIR / "model_metadata.json"),
        "materials": property_table(PROCESSED_DIR / "materials.csv"),
        "electrodes": property_table(PROCESSED_DIR / "electrodes.csv"),
        "sources": source_summary(primary_source_ids),
    }
    canonical = json.dumps(bundle, sort_keys=True, separators=(",", ":")).encode("utf-8")
    bundle["artifact_sha256"] = hashlib.sha256(canonical).hexdigest()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
    print(f"Exported {OUTPUT}")


if __name__ == "__main__":
    main()
