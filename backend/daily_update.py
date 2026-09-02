"""
Daily update runner — executes all data-refresh scripts in order once per day.
Run directly for an immediate update, or schedule via Windows Task Scheduler
(see instructions printed by: python daily_update.py --schedule)
"""

import argparse
import importlib.util
import logging
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

LOG_FILE = Path(__file__).parent / "daily_update.log"
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

SCRIPTS = [
    ("download.py",                      "Download mtgjson data + sync MySQL"),
    ("download_prices_today.py",         "Stream AllPricesToday.sql into MySQL"),
    ("lowest_prices.py",                 "Calculate lowest prices across sources"),
    ("sync_live_sealed_prices.py",       "Sync live TCGplayer sealed product prices"),
    ("populate_booster_ev_to_db.py",     "Build price data from synced card data")
]


def run_script(script_name: str, description: str) -> bool:
    path = Path(__file__).parent / script_name
    log.info("▶  %s — %s", script_name, description)
    result = subprocess.run(
        [sys.executable, str(path)],
        capture_output=False,   # let each script print to console/log normally
        text=True,
    )
    if result.returncode == 0:
        log.info("✔  %s finished successfully", script_name)
        return True
    else:
        log.error("✘  %s exited with code %d", script_name, result.returncode)
        return False


def run_all():
    log.info("═══ Daily update started at %s ═══", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    failures = []
    for script, description in SCRIPTS:
        if not run_script(script, description):
            failures.append(script)
    if failures:
        log.warning("Completed with failures: %s", ", ".join(failures))
    else:
        log.info("═══ All scripts completed successfully ═══")


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
        run_all()
