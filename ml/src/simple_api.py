from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .ml_engine import MODELS_DIR, optimize, predict, property_table, model_info, source_summary


class SimpleMlApiHandler(BaseHTTPRequestHandler):
    server_version = "EDMSimpleMLAPI/0.1"

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        routes = {
            "/health": lambda: {"status": "ok", "service": "edm-ml-api", "runtime": "stdlib-fallback", "model_dir": str(MODELS_DIR)},
            "/materials": lambda: {"materials": property_table(MODELS_DIR.parent / "data" / "processed" / "materials.csv")},
            "/electrodes": lambda: {"electrodes": property_table(MODELS_DIR.parent / "data" / "processed" / "electrodes.csv")},
            "/model-info": model_info,
            "/sources": lambda: {"sources": source_summary()},
        }
        handler = routes.get(self.path.split("?", 1)[0])
        if not handler:
            self.write_json({"error": "Not found"}, status=404)
            return
        self.write_json(handler())

    def do_POST(self) -> None:
        try:
            payload = self.read_json()
            if self.path == "/predict":
                self.write_json(predict(payload))
                return
            if self.path == "/optimize":
                self.write_json(
                    optimize(
                        payload,
                        {
                            "current_A": (float(payload.get("current_min", 2)), float(payload.get("current_max", 35))),
                            "voltage_V": (float(payload.get("voltage_min", 20)), float(payload.get("voltage_max", 160))),
                            "ton_us": (float(payload.get("ton_min", 3)), float(payload.get("ton_max", 250))),
                            "toff_us": (float(payload.get("toff_min", 3)), float(payload.get("toff_max", 250))),
                        },
                        {"mrr": float(payload.get("mrr_weight", 0.7)), "twr": float(payload.get("twr_weight", 0.3))},
                    )
                )
                return
            if self.path == "/validate":
                self.write_json(validate_supplied_rows(payload))
                return
            self.write_json({"error": "Not found"}, status=404)
        except Exception as exc:  # pragma: no cover - server defensive path
            self.write_json({"error": str(exc)}, status=500)

    def read_json(self) -> dict[str, Any] | list[dict[str, Any]]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw)

    def write_json(self, data: Any, status: int = 200) -> None:
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[ml-api] {self.address_string()} {format % args}")


def validate_supplied_rows(payload: dict[str, Any] | list[dict[str, Any]]) -> dict[str, Any]:
    rows = payload if isinstance(payload, list) else payload.get("rows", [])
    predictions = []
    mrr_errors = []
    twr_errors = []
    experimental_mrr_values = []
    predicted_mrr_values = []
    experimental_twr_values = []
    predicted_twr_values = []
    for index, row in enumerate(rows, start=1):
        pred = predict(row)
        record: dict[str, Any] = {"sample": index, **pred}
        experimental_mrr = row.get("experimental_mrr")
        experimental_twr = row.get("experimental_twr")
        if experimental_mrr not in (None, "", 0):
            error = abs(float(experimental_mrr) - pred["predicted_mrr"]) / abs(float(experimental_mrr)) * 100
            record["experimental_mrr"] = experimental_mrr
            record["mrr_error_percent"] = error
            mrr_errors.append(error)
            experimental_mrr_values.append(float(experimental_mrr))
            predicted_mrr_values.append(pred["predicted_mrr"])
        if experimental_twr not in (None, "", 0):
            error = abs(float(experimental_twr) - pred["predicted_twr"]) / abs(float(experimental_twr)) * 100
            record["experimental_twr"] = experimental_twr
            record["twr_error_percent"] = error
            twr_errors.append(error)
            experimental_twr_values.append(float(experimental_twr))
            predicted_twr_values.append(pred["predicted_twr"])
        predictions.append(record)

    def regression_metrics(actual: list[float], predicted: list[float]) -> dict[str, float | None]:
        if not actual:
            return {"mae": None, "rmse": None, "mape": None, "r2": None}
        errors = [a - p for a, p in zip(actual, predicted)]
        mae = sum(abs(error) for error in errors) / len(errors)
        rmse = (sum(error * error for error in errors) / len(errors)) ** 0.5
        nonzero_errors = [abs(error) / abs(actual[index]) * 100 for index, error in enumerate(errors) if actual[index] != 0]
        mape = sum(nonzero_errors) / len(nonzero_errors) if nonzero_errors else None
        mean_actual = sum(actual) / len(actual)
        ss_tot = sum((value - mean_actual) ** 2 for value in actual)
        ss_res = sum(error * error for error in errors)
        r2 = 1 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0
        return {"mae": mae, "rmse": rmse, "mape": mape, "r2": r2}

    return {
        "training_data": "Published research only",
        "testing_data": "Supplied independent experimental rows only; no retraining performed",
        "rows": predictions,
        "mrr": regression_metrics(experimental_mrr_values, predicted_mrr_values),
        "twr": regression_metrics(experimental_twr_values, predicted_twr_values),
        "mrr_mape": sum(mrr_errors) / len(mrr_errors) if mrr_errors else None,
        "twr_mape": sum(twr_errors) / len(twr_errors) if twr_errors else None,
    }


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 8000), SimpleMlApiHandler)
    print("EDM fallback ML API running at http://127.0.0.1:8000")
    print("Install FastAPI/Uvicorn to use the production FastAPI app: python -m pip install -r ml/requirements.txt")
    server.serve_forever()


if __name__ == "__main__":
    main()
