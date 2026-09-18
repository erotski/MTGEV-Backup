"""
Daily update runner — executes all data-refresh scripts in order once per day.
Run directly for an immediate update, or schedule via Windows Task Scheduler
(see instructions printed by: python daily_update.py --schedule)
"""

import argparse
import importlib.util
import json
import logging
import math
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

LOG_FILE = Path(__file__).parent / "daily_update.log"
TELEMETRY_JSON = Path(__file__).parent.parent / "public" / "data" / "pipeline_execution_logs.json"
LATEST_RUN_JSON = Path(__file__).parent.parent / "public" / "data" / "latest_pipeline_run.json"
INTERVAL_SECONDS = 24 * 60 * 60  # 1 day

# Windows consoles default to cp1252, which can't encode arbitrary Unicode; make the
# console stream tolerant so a stray symbol in a log message can never crash the run.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="replace")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

REQUIRED_OUTPUTS = (
    "sets.json",
    "sealed_products.json",
    "booster_ev.json",
    "arbitrage_leaderboard.json",
    "product_metrics.json",
    "single_card_prices.json",
    "product_chase_cards.json",
    "pricing_reliability.json",
    "precon_decks.json",
    "jumpstart_validation_report.json",
    "pricing_validator_diagnostics.json",
)

TELEMETRY_OUTPUTS = (
    "pipeline_execution_logs.json",
    "latest_pipeline_run.json",
)

SNAPSHOT_MANIFEST = "snapshot_manifest.json"
PUBLISHED_SNAPSHOT_FILES = (
    *REQUIRED_OUTPUTS,
    *TELEMETRY_OUTPUTS,
)


def get_quick_test_limit():
    """Optional cap on sets/products processed by the heaviest stages, read
    from QUICK_TEST_LIMIT so short test runs can skip most of the full
    30-45 minute simulation without changing the required output contract."""
    raw = os.environ.get("QUICK_TEST_LIMIT")
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value > 0 else None


def get_quick_test_set():
    raw = os.environ.get("QUICK_TEST_SET", "").strip().upper()
    return raw or None

SCRIPTS = [
    ("download.py",                      "Download mtgjson data + sync MySQL"),
    ("download_prices_today.py",         "Stream AllPricesToday.sql into MySQL"),
    ("lowest_prices.py",                 "Calculate lowest prices across sources"),
    ("sync_live_sealed_prices.py",       "Sync live TCGplayer sealed product prices"),
    ("populate_booster_ev_to_db.py",     "Build price data from synced card data"),
    ("export_app_data.py",               "Export MySQL data to React JSON format"),
    ("load_deck_tables.py",               "Load preconstructed decks into MySQL"),
    ("export_product_chase_cards.py", "Export vendor-aware product TOP 5 chase cards"),
    ("composite_evaluator.py",           "Evaluate composite products & quantiles (10,000 MC samples)"),
    ("export_product_metrics.py",        "Export complete-product metrics by vendor"),
    ("test_product_metrics_contract.py", "Validate complete-product metrics contract"),
    ("export_jumpstart_validation_report.py", "Export Jumpstart collation validation report"),
    ("validate_pricing_and_ev.py",       "Run automated quality and pricing/EV validation audit")
]


def update_telemetry_file(run_record: dict):
    """Appends or updates pipeline execution telemetry for the Admin Portal."""
    try:
        data = {"lastUpdated": datetime.now(timezone.utc).isoformat(), "runs": [], "commonRemediations": []}
        if TELEMETRY_JSON.exists():
            with open(TELEMETRY_JSON, "r", encoding="utf-8") as f:
                data = json.load(f)

        runs = data.get("runs", [])
        runs.insert(0, run_record)
        data["runs"] = runs[:15]  # Keep last 15 runs
        data["lastUpdated"] = datetime.now(timezone.utc).isoformat()

        # Save back
        TELEMETRY_JSON.parent.mkdir(parents=True, exist_ok=True)
        with open(TELEMETRY_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log.warning("Could not write telemetry JSON: %s", e)


def write_latest_run_file(run_record: dict):
    """Writes the latest run separately for quick inspection without log parsing."""
    try:
        with LATEST_RUN_JSON.open("w", encoding="utf-8") as handle:
            json.dump(run_record, handle, indent=2)
    except OSError as error:
        log.warning("Could not write latest pipeline run JSON: %s", error)


def write_snapshot_manifest(run_id: str, generated_at: str, audit_enabled: bool) -> None:
    """Write one identity record for the atomically published data bundle."""
    data_dir = Path(__file__).parent.parent / "public" / "data"
    source_commit = os.environ.get("GITHUB_SHA")
    if not source_commit:
        try:
            source_commit = subprocess.check_output(
                ["git", "rev-parse", "HEAD"],
                cwd=Path(__file__).parent.parent,
                text=True,
                encoding="utf-8",
                errors="replace",
            ).strip()
        except (OSError, subprocess.SubprocessError):
            source_commit = "unknown"

    manifest = {
        "schemaVersion": 1,
        "pipelineRunId": run_id,
        "sourceCommit": source_commit,
        "generatedAt": generated_at,
        "auditEnabled": audit_enabled,
        "files": list(PUBLISHED_SNAPSHOT_FILES),
    }
    with (data_dir / SNAPSHOT_MANIFEST).open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)


def run_script(script_name: str, description: str) -> tuple[bool, float, int, str, list[str]]:
    path = Path(__file__).parent / script_name
    log.info(">>  %s - %s", script_name, description)
    t0 = time.time()
    # Force UTF-8 for the child's own stdout/stderr so stray Unicode symbols in its
    # print()/log output never crash on a Windows console defaulting to cp1252.
    child_env = dict(os.environ, PYTHONIOENCODING="utf-8")
    result = subprocess.run(
        [sys.executable, str(path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=child_env,
    )
    duration = round(time.time() - t0, 2)
    stdout_msg = result.stdout or ""
    stderr_msg = result.stderr or ""

    # Print output to stdout for loggers
    if stdout_msg:
        print(stdout_msg, flush=True)
    if stderr_msg:
        print(stderr_msg, file=sys.stderr, flush=True)

    if result.returncode == 0:
        log.info("OK    %s finished successfully (%.2fs)", script_name, duration)
        summary = [line.strip() for line in stdout_msg.splitlines() if line.strip()][-8:]
        return True, duration, 0, "", summary
    else:
        log.error("FAIL  %s exited with code %d (%.2fs)", script_name, result.returncode, duration)
        err_snippet = (stderr_msg.strip() or stdout_msg.strip())[-1000:]
        summary = [line.strip() for line in (stdout_msg + "\n" + stderr_msg).splitlines() if line.strip()][-8:]
        return False, duration, result.returncode, err_snippet, summary


def validate_output_bundle() -> tuple[bool, str]:
    """Reject incomplete or malformed output before Git publication."""
    data_dir = Path(__file__).parent.parent / "public" / "data"
    for filename in REQUIRED_OUTPUTS:
        path = data_dir / filename
        if not path.exists() or path.stat().st_size == 0:
            return False, f"Missing or empty output: {path}"
        try:
            with path.open("r", encoding="utf-8") as handle:
                json.load(handle)
        except (OSError, json.JSONDecodeError) as error:
            return False, f"Invalid JSON in {path}: {error}"
    manifest_path = data_dir / SNAPSHOT_MANIFEST
    if not manifest_path.exists() or manifest_path.stat().st_size == 0:
        return False, f"Missing or empty output: {manifest_path}"
    try:
        with manifest_path.open("r", encoding="utf-8") as handle:
            manifest = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        return False, f"Invalid JSON in {manifest_path}: {error}"
    if not isinstance(manifest, dict) or not manifest.get("pipelineRunId") or not manifest.get("sourceCommit"):
        return False, "snapshot_manifest.json is missing pipelineRunId or sourceCommit"
    if manifest.get("schemaVersion") != 1 or manifest.get("files") != list(PUBLISHED_SNAPSHOT_FILES):
        return False, "snapshot_manifest.json has an invalid schema or file list"
    return True, ""


def validate_output_semantics() -> tuple[bool, str]:
    """Validate the core shape and numeric invariants of published snapshots."""
    data_dir = Path(__file__).parent.parent / "public" / "data"

    def load_required(filename: str):
        with (data_dir / filename).open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def finite(value) -> bool:
        return isinstance(value, (int, float)) and math.isfinite(float(value))

    def numeric(value):
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return None
        return float(value) if finite(value) else None

    def validate_quantiles(values, label: str) -> str | None:
        if not isinstance(values, list) or len(values) != 100:
            return f"{label} must contain exactly 100 buckets"
        if not all(finite(value) for value in values):
            return f"{label} contains a non-finite bucket"
        if any(values[index] > values[index + 1] + 1e-6 for index in range(99)):
            return f"{label} is not monotonic"
        return None

    booster_evs = load_required("booster_ev.json")
    if not isinstance(booster_evs, list):
        return False, "booster_ev.json must contain an array"
    for index, record in enumerate(booster_evs):
        if not isinstance(record, dict):
            return False, f"booster_ev.json[{index}] must be an object"
        if not record.get("setCode") or not record.get("boosterName"):
            return False, f"booster_ev.json[{index}] is missing setCode or boosterName"
        if not record.get("vendor") or not record.get("priceMode"):
            return False, f"booster_ev.json[{index}] is missing vendor or priceMode"
        if "quantiles" in record:
            error = validate_quantiles(record["quantiles"], f"booster_ev.json[{index}].quantiles")
            if error:
                return False, error
            minimum = numeric(record.get("evMin"))
            maximum = numeric(record.get("evMax"))
            if minimum is not None and abs(record["quantiles"][0] - minimum) > 0.01:
                return False, f"booster_ev.json[{index}] minimum endpoint does not match evMin"
            if maximum is not None and abs(record["quantiles"][-1] - maximum) > 0.01:
                return False, f"booster_ev.json[{index}] maximum endpoint does not match evMax"
        for field in ("evAverage", "evMid90", "evMin", "evMax", "evMin5", "evMax5"):
            if field in record and record[field] is not None:
                value = numeric(record[field])
                if value is None or not finite(value):
                    return False, f"booster_ev.json[{index}].{field} is not numeric"

    sealed_products = load_required("sealed_products.json")
    if not isinstance(sealed_products, list):
        return False, "sealed_products.json must contain an array"
    product_ids = set()
    for index, product in enumerate(sealed_products):
        if not isinstance(product, dict):
            return False, f"sealed_products.json[{index}] must be an object"

        product_id = product.get("id") or product.get("uuid")
        if not product_id:
            return False, f"sealed_products.json[{index}] is missing id/uuid"
        if product_id in product_ids:
            return False, f"sealed_products.json contains duplicate id {product_id}"
        product_ids.add(product_id)
        for field in ("totalEvAvg", "totalEvMid90", "totalEvMin", "totalEvMin5", "totalEvMax5", "totalEvMax"):
            if field in product and product[field] is not None and not finite(product[field]):
                return False, f"sealed_products.json[{index}].{field} is not finite"
        quantiles_by_vendor = product.get("quantilesByVendor") or {}
        if not isinstance(quantiles_by_vendor, dict):
            return False, f"sealed_products.json[{index}].quantilesByVendor must be an object"
        for vendor, values in quantiles_by_vendor.items():
            error = validate_quantiles(values, f"sealed_products.json[{index}].quantilesByVendor.{vendor}")
            if error:
                return False, error

    product_metrics = load_required("product_metrics.json")
    if not isinstance(product_metrics, list):
        return False, "product_metrics.json must contain an array"
    metric_keys = {
        "productUuid", "marketPrice", "totalEvMin", "totalEvMin5", "totalEvAvg", "totalEvMid90",
        "totalEvMax5", "totalEvMax", "effectiveEv", "profitUsd", "roiPct", "packCount", "cardCount",
        "vendor", "priceMode", "provenance", "effectiveEvByBasis", "profitUsdByBasis", "roiPctByBasis",
        "evScore", "breakevenPercentile",
    }
    metric_identity_keys = set()
    for index, metric in enumerate(product_metrics):
        if not isinstance(metric, dict):
            return False, f"product_metrics.json[{index}] must be an object"
        missing = metric_keys - metric.keys()
        if missing:
            return False, f"product_metrics.json[{index}] is missing {sorted(missing)}"
        if not metric.get("productUuid") or not metric.get("vendor") or not metric.get("priceMode"):
            return False, f"product_metrics.json[{index}] is missing product identity or vendor/mode"
        for field in ("marketPrice", "totalEvMin", "totalEvMin5", "totalEvAvg", "totalEvMid90", "totalEvMax5", "totalEvMax", "effectiveEv", "profitUsd", "roiPct", "packCount", "cardCount"):
            if not isinstance(metric[field], (int, float)):
                return False, f"product_metrics.json[{index}].{field} is not numeric"
        if not isinstance(metric["evScore"], int) or not 0 <= metric["evScore"] <= 100:
            return False, f"product_metrics.json[{index}].evScore is invalid"
        if not isinstance(metric["breakevenPercentile"], int) or not 1 <= metric["breakevenPercentile"] <= 100:
            return False, f"product_metrics.json[{index}].breakevenPercentile is invalid"
        provenance = metric["provenance"]
        if not isinstance(provenance, dict) or provenance.get("source") != "pipeline" or not provenance.get("schemaVersion"):
            return False, f"product_metrics.json[{index}] has invalid provenance"
        if metric["productUuid"] not in product_ids:
            return False, f"product_metrics.json[{index}] references unknown product {metric['productUuid']}"
        metric_key = (metric["productUuid"], metric["vendor"], metric["priceMode"])
        if metric_key in metric_identity_keys:
            return False, f"product_metrics.json contains duplicate metric key {metric_key}"
        metric_identity_keys.add(metric_key)

    product_ids = {
        product.get("id") or product.get("uuid")
        for product in sealed_products
        if isinstance(product, dict) and (product.get("id") or product.get("uuid"))
    }
    chase_cards = load_required("product_chase_cards.json")
    if not isinstance(chase_cards, dict):
        return False, "product_chase_cards.json must contain an object"
    unknown_chase_products = sorted(set(chase_cards) - product_ids)
    if unknown_chase_products:
        return False, f"product_chase_cards.json contains unknown product id {unknown_chase_products[0]}"
    for product_id, modes in chase_cards.items():
        if not isinstance(modes, dict):
            return False, f"product_chase_cards.json[{product_id}] must be an object"
        for mode_key, cards in modes.items():
            if not isinstance(cards, list) or len(cards) > 5:
                return False, f"product_chase_cards.json[{product_id}].{mode_key} must contain at most 5 cards"

    pricing_reliability = load_required("pricing_reliability.json")
    if not isinstance(pricing_reliability, dict):
        return False, "pricing_reliability.json must contain an object"

    precon_decks = load_required("precon_decks.json")
    if not isinstance(precon_decks, dict):
        return False, "precon_decks.json must contain an object"

    jumpstart_report = load_required("jumpstart_validation_report.json")
    if not isinstance(jumpstart_report, dict) or jumpstart_report.get("status") not in {"pass", "warning"}:
        return False, "jumpstart_validation_report.json has invalid status"
    jumpstart_sets = jumpstart_report.get("sets")
    if not isinstance(jumpstart_sets, list) or not jumpstart_sets:
        return False, "jumpstart_validation_report.json must contain a non-empty sets array"
    configuration_count = 0
    for set_report in jumpstart_sets:
        configurations = set_report.get("configurations")
        if not isinstance(configurations, list):
            return False, f"Jumpstart set {set_report.get('setCode')} has invalid configurations"
        configuration_count += len(configurations)
        sample_size = set_report.get("sampleSize") or 0
        allocated_samples = 0
        for configuration in configurations:
            if configuration.get("totalPicks") != 20:
                return False, f"Jumpstart {set_report.get('setCode')} configuration {configuration.get('boosterIndex')} is not 20 cards"
            allocated_samples += configuration.get("allocatedSamples") or 0
            contents = configuration.get("contents")
            if not isinstance(contents, list) or not contents:
                return False, f"Jumpstart {set_report.get('setCode')} configuration has no contents"
            if any(item.get("treatment") not in {"fixed", "variable"} for item in contents):
                return False, f"Jumpstart {set_report.get('setCode')} contains unknown sheet treatment"
        if configurations and allocated_samples != sample_size:
            return False, f"Jumpstart {set_report.get('setCode')} allocations do not total {sample_size}"
    if jumpstart_report.get("summary", {}).get("configurationCount") != configuration_count:
        return False, "jumpstart_validation_report.json configuration summary is incorrect"

    return True, ""


def validate_telemetry_outputs() -> tuple[bool, str]:
    """Validate runner-owned telemetry after the current run has been written."""
    data_dir = Path(__file__).parent.parent / "public" / "data"
    for filename in TELEMETRY_OUTPUTS:
        path = data_dir / filename
        if not path.exists() or path.stat().st_size == 0:
            return False, f"Missing or empty telemetry output: {path}"
        try:
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError) as error:
            return False, f"Invalid JSON in {path}: {error}"
        if filename == "pipeline_execution_logs.json":
            if not isinstance(payload, dict) or not isinstance(payload.get("runs"), list):
                return False, "pipeline_execution_logs.json must contain a runs array"
        elif not isinstance(payload, dict) or payload.get("status") not in {"success", "failed"}:
            return False, "latest_pipeline_run.json must contain a valid status"
    return True, ""


def run_all() -> bool:
    start_dt = datetime.now(timezone.utc)
    run_id = f"run-{start_dt.strftime('%Y-%m-%d-%H%M%S')}"
    quick_test_limit = get_quick_test_limit()
    quick_test_set = get_quick_test_set()
    if quick_test_set:
        log.info("Quick test mode: restricting heavy stages to set %s.", quick_test_set)
    if quick_test_limit:
        log.info("Quick test mode: limiting heavy stages to %d sets/products.", quick_test_limit)
    log.info("=== Daily update started at %s ===", start_dt.strftime("%Y-%m-%d %H:%M:%S UTC"))
    failures = []
    stage_records = []
    error_records = []
    overall_t0 = time.time()

    for script, description in SCRIPTS:
        success, duration, exit_code, err_msg, output_summary = run_script(script, description)
        stage_records.append({
            "name": script,
            "description": description,
            "status": "success" if success else "failed",
            "duration": duration,
            "exitCode": exit_code,
            "summary": output_summary,
        })
        if not success:
            failures.append(script)
            error_records.append({
                "stage": script,
                "exitCode": exit_code,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "errorTrace": err_msg or f"Process exited with non-zero code {exit_code}"
            })
            # Never publish a partial dataset. Every stage is required for a
            # coherent set of exported JSON files.
            log.error("Required stage %s failed. Aborting before publication.", script)
            break

    if not failures:
        try:
            audit_enabled = os.environ.get("AUDIT_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
            write_snapshot_manifest(run_id, start_dt.isoformat(), audit_enabled)
        except (OSError, TypeError, ValueError) as error:
            failures.append("snapshot_manifest")
            error_records.append({
                "stage": "snapshot_manifest",
                "exitCode": 1,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "errorTrace": str(error),
            })

    if not failures:
        outputs_valid, output_error = validate_output_bundle()
        if not outputs_valid:
            failures.append("output_bundle")
            error_records.append({
                "stage": "output_bundle",
                "exitCode": 1,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "errorTrace": output_error,
            })
            log.error("Output bundle validation failed. Aborting before publication: %s", output_error)

    if not failures:
        semantics_valid, semantics_error = validate_output_semantics()
        if not semantics_valid:
            failures.append("output_semantics")
            error_records.append({
                "stage": "output_semantics",
                "exitCode": 1,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "errorTrace": semantics_error,
            })
            log.error("Output semantic validation failed. Aborting before publication: %s", semantics_error)

    total_duration = round(time.time() - overall_t0, 2)
    overall_status = "failed" if failures else "success"

    run_record = {
        "id": run_id,
        "timestamp": start_dt.isoformat(),
        "trigger": "scheduled_pipeline",
        "status": overall_status,
        "durationSeconds": total_duration,
        "quickTestLimit": quick_test_limit,
        "quickTestSet": quick_test_set,
        "stages": stage_records,
        "errors": error_records
    }
    update_telemetry_file(run_record)
    write_latest_run_file(run_record)

    telemetry_valid, telemetry_error = validate_telemetry_outputs()
    if not telemetry_valid:
        failures.append("telemetry_outputs")
        log.error("Telemetry validation failed after run record write: %s", telemetry_error)
        run_record["status"] = "failed"
        run_record["errors"].append({
            "stage": "telemetry_outputs",
            "exitCode": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "errorTrace": telemetry_error,
        })
        update_telemetry_file(run_record)
        write_latest_run_file(run_record)

    if failures:
        log.error("Completed with failures: %s", ", ".join(failures))
        return False
    else:
        log.info("=== All scripts completed successfully (%.2fs) ===", total_duration)
        return True


def print_schedule_instructions():
    python = sys.executable
    script = Path(__file__).resolve()
    # Windows Task Scheduler command to create a daily task at 03:00
    schtasks_cmd = (
        f'schtasks /Create /TN "MtgDailyUpdate" /TR "{python} {script}" '
        f'/SC DAILY /ST 03:00 /F'
    )
    print("\nTo schedule this script to run daily at 03:00 via Windows Task Scheduler,")
    print("run the following command in an elevated (Admin) terminal:\n")
    print(f"  {schtasks_cmd}\n")
    print("To remove the task later:")
    print('  schtasks /Delete /TN "MtgDailyUpdate" /F\n')
    print("To check its status:")
    print('  schtasks /Query /TN "MtgDailyUpdate"\n')


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MTG daily data update runner")
    parser.add_argument(
        "--schedule", action="store_true",
        help="Print Windows Task Scheduler setup instructions instead of running",
    )
    parser.add_argument(
        "--loop", action="store_true",
        help="Keep running in a loop every 24 h (useful inside a container/server)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Check that all scripts exist and are valid Python without running them",
    )
    parser.add_argument(
        "--quick-test-limit", type=int, default=None,
        help="Limit the heaviest stages (booster simulation, live price sync) to N sets/products for a fast test run",
    )
    args = parser.parse_args()

    if args.quick_test_limit:
        os.environ["QUICK_TEST_LIMIT"] = str(args.quick_test_limit)

    if args.schedule:
        print_schedule_instructions()
        sys.exit(0)

    if args.dry_run:
        ok = True
        for script, description in SCRIPTS:
            path = Path(__file__).parent / script
            if not path.exists():
                log.error("MISSING  %s", path)
                ok = False
                continue
            result = subprocess.run(
                [sys.executable, "-m", "py_compile", str(path)],
                capture_output=True, text=True,
                encoding="utf-8", errors="replace",
                env=dict(os.environ, PYTHONIOENCODING="utf-8"),
            )
            if result.returncode == 0:
                log.info("OK       %s — %s", script, description)
            else:
                log.error("SYNTAX   %s\n%s", script, result.stderr.strip())
                ok = False
        sys.exit(0 if ok else 1)

    if args.loop:
        log.info("Loop mode: will run every %d seconds", INTERVAL_SECONDS)
        while True:
            run_all()
            log.info("Sleeping for %d seconds …", INTERVAL_SECONDS)
            time.sleep(INTERVAL_SECONDS)
    else:
        success = run_all()
        if not success:
            sys.exit(1)
