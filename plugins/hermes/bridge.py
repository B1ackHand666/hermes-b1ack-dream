"""Private, bounded stdio bridge to the bundled B1ack Dream Node runtime."""

from __future__ import annotations

import json
import logging
import queue
import shutil
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Any, NamedTuple

logger = logging.getLogger(__name__)


class BridgeError(RuntimeError):
    """Raised when the local runtime is unavailable or does not answer safely."""


class NodeVersion(NamedTuple):
    executable: str
    major: int
    text: str


class RuntimeBridge:
    def __init__(self, plugin_dir: Path, data_dir: Path, config: dict[str, Any], native_paths: tuple[Path, Path] | None = None) -> None:
        self._plugin_dir = plugin_dir
        self._data_dir = data_dir
        self._config = config
        self._native_paths = native_paths
        self._process: subprocess.Popen[str] | None = None
        self._pending: dict[str, queue.Queue[dict[str, Any]]] = {}
        self._pending_lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._ready: dict[str, Any] | None = None

    @property
    def is_running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    @property
    def web_ui(self) -> dict[str, Any] | None:
        return (self._ready or {}).get("webUi")

    @property
    def pid(self) -> int | None:
        return self._process.pid if self._process else None

    @staticmethod
    def runtime_path(plugin_dir: Path) -> Path:
        return plugin_dir / "runtime" / "hermes-sidecar.js"

    @staticmethod
    def node_path() -> str | None:
        return shutil.which("node")

    @classmethod
    def node_version(cls, *, timeout: float = 2.0) -> NodeVersion | None:
        """Read a real local Node version, failing closed on any ambiguity."""
        node = cls.node_path()
        if not node:
            return None
        try:
            completed = subprocess.run(
                [node, "--version"], capture_output=True, text=True,
                encoding="utf-8", timeout=timeout, check=False,
            )
        except (OSError, subprocess.SubprocessError, UnicodeError):
            return None
        output = (completed.stdout or "").strip()
        if completed.returncode != 0:
            return None
        # Node's stable contract is vMAJOR.MINOR.PATCH.  Treat diagnostic
        # output, partial versions and arbitrary wrappers as unavailable.
        import re
        matched = re.fullmatch(r"v?(\d+)\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", output)
        if not matched:
            return None
        return NodeVersion(node, int(matched.group(1)), output)

    @classmethod
    def node_unavailable_reason(cls) -> str | None:
        node = cls.node_path()
        if not node:
            return "Node.js was not found on PATH. B1ack Dream requires Node.js 20 or newer."
        version = cls.node_version()
        if version is None:
            return "Node.js version could not be verified. B1ack Dream requires Node.js 20 or newer."
        if version.major < 20:
            return f"Node.js {version.text.removeprefix('v')} detected. B1ack Dream requires Node.js 20 or newer."
        return None

    @classmethod
    def require_compatible_node(cls) -> NodeVersion:
        reason = cls.node_unavailable_reason()
        if reason:
            raise BridgeError(reason)
        version = cls.node_version()
        # The second lookup cannot normally differ, but fail closed if PATH is
        # swapped between checks.
        if version is None or version.major < 20:
            raise BridgeError("Node.js version could not be verified. B1ack Dream requires Node.js 20 or newer.")
        return version

    def start(self, timeout: float = 8.0) -> None:
        if self.is_running:
            return
        runtime = self.runtime_path(self._plugin_dir)
        if not runtime.is_file():
            raise BridgeError(f"Bundled B1ack Dream runtime is missing: {runtime}")
        # Do not rely on a prior provider availability probe: this method can
        # be called directly and PATH can change while Hermes is running.
        node = self.require_compatible_node().executable
        self._data_dir.mkdir(parents=True, exist_ok=True)
        args = [
            node, str(runtime), "--data-dir", str(self._data_dir),
            "--host", "127.0.0.1",
            "--port", str(int(self._config.get("webui_port", 0) or 0)),
            # The local API is required for the authenticated Hermes Dashboard
            # proxy. ``webui_enabled`` controls only the standalone HTML
            # fallback; it never disables the provider's Dashboard backend.
            "--web-ui", "true",
            "--standalone-ui", "true" if self._config.get("webui_enabled", True) else "false",
        ]
        if self._native_paths:
            args.extend(["--user-path", str(self._native_paths[0]), "--memory-path", str(self._native_paths[1])])
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        # Register the readiness queue before spawning: Node can emit its first
        # line before the reader thread is scheduled on a fast machine.
        ready_queue: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
        with self._pending_lock:
            self._pending["ready"] = ready_queue
        self._process = subprocess.Popen(
            args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", bufsize=1, creationflags=creationflags,
        )
        threading.Thread(target=self._read_loop, name="b1ack-dream-stdio", daemon=True).start()
        try:
            ready = ready_queue.get(timeout=timeout)
        except queue.Empty as exc:
            self.stop()
            raise BridgeError("B1ack Dream runtime did not announce readiness.") from exc
        finally:
            with self._pending_lock:
                self._pending.pop("ready", None)
        if not ready.get("ok"):
            self.stop()
            raise BridgeError(str(ready.get("error") or "B1ack Dream runtime failed to start."))
        self._ready = dict(ready.get("result") or {})
        self.call("settings", {
            "memoryStyle": self._config.get("memory_style", "balanced"),
            "automaticDream": bool(self._config.get("automatic_dream", True)),
        }, timeout=timeout)

    def call(self, method: str, params: dict[str, Any] | None = None, *, timeout: float = 1.5) -> Any:
        if not self.is_running or not self._process or not self._process.stdin:
            raise BridgeError("B1ack Dream runtime is not running.")
        request_id = str(uuid.uuid4())
        response_queue: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
        with self._pending_lock:
            self._pending[request_id] = response_queue
        try:
            with self._write_lock:
                self._process.stdin.write(json.dumps({"id": request_id, "method": method, "params": params or {}}, ensure_ascii=False) + "\n")
                self._process.stdin.flush()
            response = response_queue.get(timeout=timeout)
        except queue.Empty as exc:
            raise BridgeError(f"B1ack Dream runtime timed out during {method}.") from exc
        finally:
            with self._pending_lock:
                self._pending.pop(request_id, None)
        if not response.get("ok"):
            raise BridgeError(str(response.get("error") or f"B1ack Dream runtime failed during {method}."))
        return response.get("result")

    def stop(self) -> None:
        process = self._process
        if not process:
            return
        try:
            if process.poll() is None:
                try:
                    self.call("shutdown", timeout=2.0)
                except Exception:
                    pass
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=3.0)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass
        finally:
            self._process = None
            for stream in (process.stdin, process.stdout, process.stderr):
                try:
                    if stream:
                        stream.close()
                except Exception:
                    pass

    def _wait_for(self, request_id: str, timeout: float) -> dict[str, Any]:
        response_queue: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
        with self._pending_lock:
            self._pending[request_id] = response_queue
        try:
            return response_queue.get(timeout=timeout)
        except queue.Empty as exc:
            raise BridgeError("B1ack Dream runtime did not announce readiness.") from exc
        finally:
            with self._pending_lock:
                self._pending.pop(request_id, None)

    def _read_loop(self) -> None:
        process = self._process
        if not process or not process.stdout:
            return
        for line in process.stdout:
            try:
                response = json.loads(line)
                request_id = response.get("id")
                if not isinstance(request_id, str):
                    continue
                with self._pending_lock:
                    target = self._pending.get(request_id)
                if target:
                    target.put_nowait(response)
            except Exception:
                logger.debug("Ignoring malformed B1ack Dream runtime output.", exc_info=True)
