"""
Daily update runner — executes all data-refresh scripts in order once per day.
Run directly for an immediate update, or schedule via Windows Task Scheduler
(see instructions printed by: python daily_update.py --schedule)
"""

import argparse
import importlib.util
import json
import logging
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

LOG_FILE = Path(__file__).parent / "daily_update.log"
TELEMETRY_JSON = Path(__file__).parent.parent / "public" / "data" / "pipeline_execution_logs.json"
INTERVAL_SECONDS = 24 * 60 * 60  # 1 day

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
    "single_card_prices.json",
    "product_chase_cards.json",
)

SCRIPTS = [
    ("download.py",                      "Download mtgjson data + sync MySQL"),
    ("download_prices_today.py",         "Stream AllPricesToday.sql into MySQL"),
    ("lowest_prices.py",                 "Calculate lowest prices across sources"),
    ("sync_live_sealed_prices.py",       "Sync live TCGplayer sealed product prices"),
    ("populate_booster_ev_to_db.py",     "Build price data from synced card data"),
    ("export_app_data.py",               "Export MySQL data to React JSON format"),
    ("export_product_chase_cards.py", "Export vendor-aware product TOP 5 chase cards"),
    ("composite_evaluator.py",           "Evaluate composite products & quantiles (10,000 MC samples)"),
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


def run_script(script_name: str, description: str) -> tuple[bool, float, int, str]:
    path = Path(__file__).parent / script_name
    log.info("▶  %s — %s", script_name, description)
    t0 = time.time()
    result = subprocess.run(
        [sys.executable, str(path)],
        capture_output=True,
        text=True,
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
        log.info("✔  %s finished successfully (%.2fs)", script_name, duration)
        return True, duration, 0, ""
    else:
        log.error("✘  %s exited with code %d (%.2fs)", script_name, result.returncode, duration)
        err_snippet = (stderr_msg.strip() or stdout_msg.strip())[-1000:]
        return False, duration, result.returncode, err_snippet


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
    return True, ""


def run_all() -> bool:
    start_dt = datetime.now(timezone.utc)
    log.info("═══ Daily update started at %s ═══", start_dt.strftime("%Y-%m-%d %H:%M:%S UTC"))
    failures = []
    stage_records = []
    error_records = []
    overall_t0 = time.time()

    for script, description in SCRIPTS:
        success, duration, exit_code, err_msg = run_script(script, description)
        stage_records.append({
            "name": script,
            "description": description,
            "status": "success" if success else "failed",
            "duration": duration,
            "exitCode": exit_code
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

    total_duration = round(time.time() - overall_t0, 2)
    overall_status = "failed" if failures else "success"

    run_record = {
        "id": f"run-{start_dt.strftime('%Y-%m-%d-%H%M%S')}",
        "timestamp": start_dt.isoformat(),
        "trigger": "scheduled_pipeline",
        "status": overall_status,
        "durationSeconds": total_duration,
        "stages": stage_records,
        "errors": error_records
    }
    update_telemetry_file(run_record)

    if failures:
        log.error("Completed with failures: %s", ", ".join(failures))
        return False
    else:
        log.info("═══ All scripts completed successfully (%.2fs) ═══", total_duration)
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
    args = parser.parse_args()

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
