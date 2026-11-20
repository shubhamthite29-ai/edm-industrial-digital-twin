from __future__ import annotations

import argparse
from pathlib import Path

from .ml_engine import build_all


def main() -> None:
    parser = argparse.ArgumentParser(description="Build EDM literature dataset and freeze local ML models.")
    parser.add_argument("--package", required=True, help="Path to edm_literature_data_package.zip")
    parser.add_argument("--train", action="store_true", help="Train/freeze models after data collection. Omit until source coverage is approved.")
    args = parser.parse_args()
    result = build_all(Path(args.package), train=args.train)
    print("EDM ML data pipeline complete")
    print(result)


if __name__ == "__main__":
    main()
