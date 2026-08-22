"""Safe, profile-scoped runtime state for the B1ack Dream provider.

This file intentionally contains only process and localhost health checks.  It
never reads Memory Center data and it never touches Hermes native memory.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def runtime_path(hermes_home: Path) -> Path:
    return hermes_home / "b1ack-dream" / "runtime.json"


def atomic_json_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def read_runtime_state(hermes_home: Path) -> dict[str, Any]:
    try:
        value = json.loads(runtime_path(hermes_home).read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, OSError, UnicodeError, json.JSONDecodeError):
        return {}


def _pid_alive(value: Any) -> bool:
    if not isinstance(value, int) or value <= 0:
        return False
    try:
        # Hermes ships psutil on supported Windows/Linux builds. It avoids the
        # platform-specific ambiguity of os.kill(pid, 0) on Windows.
        import psutil
        try:
            process = psutil.Process(value)
            return process.is_running() and process.status() != psutil.STATUS_ZOMBIE
        except psutil.AccessDenied:
            return True
        except psutil.NoSuchProcess:
            return False
    except ImportError:
        pass
    except (OSError, ProcessLookupError):
        return False
    try:
        # Minimal fallback for lean Hermes environments. An access error means
        # the process exists but is not ours to signal.
        os.kill(value, 0)
        return True
    except PermissionError:
        return True
    except (ProcessLookupError, OSError):
        return False


def _safe_web_ui(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    host = value.get("host")
    port = value.get("port")
    if host not in {"127.0.0.1", "localhost", "::1"} or not isinstance(port, int) or not (1 <= port <= 65535):
        return None
    # Normalise public output to loopback IPv4.  The Node runtime itself only
    # binds this address, so this never expands browser exposure.
    return {"host": "127.0.0.1" if host == "localhost" else host, "port": port}


def probe_web_ui(web_ui: dict[str, Any] | None, timeout: float = 0.6) -> bool:
    if not web_ui:
        return False
    try:
        request = Request(f"http://{web_ui['host']}:{web_ui['port']}/api/ping", method="GET")
        with urlopen(request, timeout=timeout) as response:
            return response.status == 200
    except (OSError, URLError, ValueError):
        return False


def mark_stopped(hermes_home: Path, state: dict[str, Any] | None = None) -> dict[str, Any]:
    previous = state if isinstance(state, dict) else read_runtime_state(hermes_home)
    stopped = {
        "running": False,
        "provider_pid": previous.get("provider_pid"),
        "sidecar_pid": previous.get("sidecar_pid"),
        "started_at": previous.get("started_at"),
        "stopped_at": utc_now(),
        "web_ui": None,
        "standalone_web_ui_enabled": previous.get("standalone_web_ui_enabled", True),
    }
    atomic_json_write(runtime_path(hermes_home), stopped)
    return stopped


def runtime_status(hermes_home: Path, *, repair_stale: bool = False) -> dict[str, Any]:
    """Return a fail-closed runtime verdict without leaking profile paths."""
    state = read_runtime_state(hermes_home)
    web_ui = _safe_web_ui(state.get("web_ui"))
    declared_running = state.get("running") is True
    provider_alive = _pid_alive(state.get("provider_pid"))
    sidecar_alive = _pid_alive(state.get("sidecar_pid"))
    reachable = probe_web_ui(web_ui) if declared_running and provider_alive and sidecar_alive else False
    running = declared_running and provider_alive and sidecar_alive and reachable
    if declared_running and not running and repair_stale:
        state = mark_stopped(hermes_home, state)
        web_ui = None
    reason = None
    if not running:
        if not state:
            reason = "B1ack Dream has not started in this profile."
        elif not declared_running:
            reason = "B1ack Dream provider is not currently running."
        elif not provider_alive or not sidecar_alive:
            reason = "B1ack Dream runtime process is no longer running."
        else:
            reason = "B1ack Dream WebUI health check did not respond."
    return {
        "running": running,
        "provider_pid_alive": provider_alive,
        "sidecar_pid_alive": sidecar_alive,
        "web_ui_reachable": reachable,
        "web_ui": web_ui if running else None,
        "standalone_web_ui_enabled": bool(state.get("standalone_web_ui_enabled", web_ui is not None)),
        "started_at": state.get("started_at"),
        "stopped_at": state.get("stopped_at"),
        "reason": reason,
    }
