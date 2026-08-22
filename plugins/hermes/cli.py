"""CLI entry points discovered by Hermes only while b1ack-dream is active."""

from __future__ import annotations

import webbrowser
from pathlib import Path

from .runtime_state import runtime_status


def _home() -> Path:
    try:
        from hermes_constants import get_hermes_home
        return Path(get_hermes_home())
    except Exception:
        import os
        return Path(os.environ.get("HERMES_HOME", "~/.hermes")).expanduser()


def command(args) -> None:
    hermes_home = _home()
    data_dir = hermes_home / "b1ack-dream"
    subcommand = getattr(args, "b1ack_dream_command", None) or "status"
    if subcommand == "status":
        config = data_dir / "config.json"
        print(f"B1ack Dream data: {data_dir}")
        print(f"Configuration: {'configured' if config.exists() else 'defaults (run hermes memory setup)'}")
        status = runtime_status(hermes_home, repair_stale=True)
        if status["running"]:
            web = status["web_ui"]
            print("Provider runtime: running")
            if status["standalone_web_ui_enabled"]:
                print(f"WebUI: http://{web['host']}:{web['port']}")
            else:
                print("WebUI: standalone fallback disabled (Hermes Dashboard remains available)")
        else:
            print("Provider runtime: stopped")
            print("WebUI: B1ack Dream WebUI is not running.")
            print(f"Reason: {status['reason']}")
        dashboard = hermes_home / "plugins" / "b1ack-dream" / "dashboard" / "manifest.json"
        print(f"Dashboard plugin: {'installed' if dashboard.is_file() else 'not installed'}")
        print("Tip: B1ack Dream is also available directly in `hermes dashboard` when the plugin is enabled.")
        return
    if subcommand == "ui":
        status = runtime_status(hermes_home, repair_stale=True)
        web = status.get("web_ui")
        if not status["running"] or not isinstance(web, dict):
            print("B1ack Dream WebUI is not running. Start Hermes with b1ack-dream enabled.")
            return
        if not status["standalone_web_ui_enabled"]:
            print("B1ack Dream standalone WebUI is disabled. Open `hermes dashboard` → B1ack Dream instead.")
            return
        url = f"http://{web['host']}:{web['port']}"
        print(url)
        if getattr(args, "open", False):
            webbrowser.open(url)
        return
    if subcommand == "dream":
        print("Dream runs at primary-session end and on its configured timer while the provider is running. Use Hermes Dashboard or the standalone WebUI for a manual Dream.")


def register_cli(subparser) -> None:
    subs = subparser.add_subparsers(dest="b1ack_dream_command")
    subs.add_parser("status", help="Show B1ack Dream profile status")
    ui = subs.add_parser("ui", help="Print the running local WebUI URL")
    ui.add_argument("--open", action="store_true", help="Open the local WebUI in a browser")
    subs.add_parser("dream", help="Explain how to run a manual Dream")
    subparser.set_defaults(func=command)
