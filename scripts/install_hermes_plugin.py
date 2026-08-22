#!/usr/bin/env python3
"""Install the bundled B1ack Dream user plugin into a Hermes profile.

The script copies code only to ``<HERMES_HOME>/plugins/b1ack-dream``.  It never
touches the profile's b1ack-dream data directory or Hermes native memories.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[1]
SOURCE = REPOSITORY / "plugins" / "hermes"


def hermes_home(value: str | None) -> Path:
    return Path(value or os.environ.get("HERMES_HOME", "~/.hermes")).expanduser().resolve()


def install(target_home: Path, *, force: bool) -> Path:
    runtime = SOURCE / "runtime" / "hermes-sidecar.js"
    dashboard = SOURCE / "dashboard"
    required_dashboard_files = (
        dashboard / "manifest.json",
        dashboard / "plugin_api.py",
        dashboard / "dist" / "index.js",
        dashboard / "dist" / "style.css",
    )
    if not runtime.is_file() or any(not path.is_file() for path in required_dashboard_files):
        raise RuntimeError("Bundled runtime or Dashboard bundle is missing. Run `npm ci` then `npm run build:plugin` before installing.")
    target = target_home / "plugins" / "b1ack-dream"
    if target.exists() and not force:
        raise RuntimeError(f"{target} already exists. Re-run with --force to replace plugin code; profile data is preserved.")
    temporary = target.with_name(".b1ack-dream.installing")
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(SOURCE, temporary, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    if target.exists():
        shutil.rmtree(target)
    temporary.replace(target)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Install the Hermes B1ack Dream Memory Provider.")
    parser.add_argument("--hermes-home", help="Hermes profile directory (defaults to HERMES_HOME or ~/.hermes)")
    parser.add_argument("--force", action="store_true", help="Replace existing plugin code; never deletes b1ack-dream profile data")
    args = parser.parse_args()
    try:
        target = install(hermes_home(args.hermes_home), force=args.force)
    except RuntimeError as exc:
        print(f"Installation failed: {exc}", file=sys.stderr)
        return 1
    print(f"Installed Hermes B1ack Dream to {target}")
    print("Run `hermes memory setup`, select `b1ack-dream`, then start Hermes normally.")
    print("After enabling the plugin, manage it in `hermes dashboard` → B1ack Dream.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
