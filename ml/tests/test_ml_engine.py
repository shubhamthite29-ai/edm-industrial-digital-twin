import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "src" / "data" / "ml" / "frozen-research-model.json"
DATA = ROOT / "ml" / "data" / "shailesh_sir"


class ShaileshSingleSourceModelTest(unittest.TestCase):
    def setUp(self):
        self.artifact = json.loads(ARTIFACT.read_text(encoding="utf-8"))

    def test_artifact_has_only_supported_features(self):
        self.assertEqual(self.artifact["metadata"]["process_features"], ["Current_A", "Voltage_V", "TON_us", "Electrode_Coating"])
        self.assertNotIn("Rotation_RPM", json.dumps(self.artifact))
        self.assertNotIn("TOFF", self.artifact["metadata"]["process_features"])

    def test_archive_scope_and_counts(self):
        metadata = self.artifact["metadata"]
        self.assertEqual(metadata["source_count"], 1)
        self.assertEqual(metadata["real_row_count"], 32)
        self.assertEqual(metadata["synthetic_row_count"], 10000)
        self.assertEqual(metadata["materials"], ["Ti-6Al-4V"])
        self.assertEqual(metadata["electrodes"], ["Aluminium (Al)"])
        self.assertEqual(metadata["target_units"], {"mrr": "g/min", "twr": "g/min"})

    def test_required_single_source_outputs_exist(self):
        for name in ["REAL_EXPERIMENTAL.csv", "SYNTHETIC_AUGMENTED.csv", "FINAL_TRAINING_DATA.csv", "PAPER_MATCH_VALIDATION.csv"]:
            self.assertTrue((DATA / name).is_file(), name)
        for name in ["MODEL_RESULTS.csv", "FEATURE_IMPORTANCE.csv", "ML_MODEL_REPORT.md"]:
            self.assertTrue((ROOT / "ml" / "reports" / name).is_file(), name)

    def test_browser_tree_ensemble_matches_python_export_cases(self):
        completed = subprocess.run(["node", "ml/tests/browser_artifact_check.mjs"], cwd=ROOT, check=True, capture_output=True, text=True)
        outcome = json.loads(completed.stdout)
        self.assertEqual(outcome["cases"], 20)
        self.assertLessEqual(outcome["maximumMrrDifference"], 1e-12)
        self.assertLessEqual(outcome["maximumTwrDifference"], 1e-12)


if __name__ == "__main__":
    unittest.main()
