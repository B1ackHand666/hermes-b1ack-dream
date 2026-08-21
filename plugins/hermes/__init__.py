"""Official Hermes MemoryProvider adapter for Hermes B1ack Dream 0.1.0."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider, RecallStatus

from .bridge import BridgeError, RuntimeBridge

logger = logging.getLogger(__name__)
_PLUGIN_DIR = Path(__file__).resolve().parent
_DEFAULT_CONFIG: dict[str, Any] = {
    "automatic_dream": True,
    "scheduled_dream_hours": 24,
    "memory_style": "balanced",
    "webui_enabled": True,
    "webui_port": 0,
    "enable_native_memory_editor": False,
}


def _atomic_json_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def _read_config(path: Path) -> dict[str, Any]:
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
        return {**_DEFAULT_CONFIG, **(loaded if isinstance(loaded, dict) else {})}
    except FileNotFoundError:
        return dict(_DEFAULT_CONFIG)
    except Exception as exc:
        raise BridgeError(f"B1ack Dream configuration is invalid: {exc}") from exc


class B1ackDreamMemoryProvider(MemoryProvider):
    """Thin official adapter; all memory semantics stay in the bundled runtime."""

    def __init__(self) -> None:
        self._bridge: RuntimeBridge | None = None
        self._data_dir: Path | None = None
        self._config_path: Path | None = None
        self._config: dict[str, Any] = dict(_DEFAULT_CONFIG)
        self._session_id = ""
        self._write_enabled = False
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="b1ack-dream")
        self._last_recall: RecallStatus | None = None
        self._prefetch_cache: dict[tuple[str, str], dict[str, Any]] = {}
        self._cache_lock = threading.Lock()
        self._shutdown = False
        self._scheduled_in_flight = False

    @property
    def name(self) -> str:
        return "b1ack-dream"

    def is_available(self) -> bool:
        return RuntimeBridge.runtime_path(_PLUGIN_DIR).is_file() and RuntimeBridge.node_path() is not None

    def unavailable_reason(self) -> str:
        if not RuntimeBridge.runtime_path(_PLUGIN_DIR).is_file():
            return "The B1ack Dream plugin runtime is incomplete; reinstall the plugin."
        if RuntimeBridge.node_path() is None:
            return "Install Node.js 20 or newer and ensure `node` is on PATH."
        return "B1ack Dream is unavailable."

    def initialize(self, session_id: str, **kwargs: Any) -> None:
        if self._shutdown:
            self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="b1ack-dream")
            self._shutdown = False
        hermes_home = Path(str(kwargs["hermes_home"])).expanduser().resolve()
        self._data_dir = hermes_home / "b1ack-dream"
        self._config_path = self._data_dir / "config.json"
        self._config = _read_config(self._config_path)
        self._session_id = session_id
        # Only an explicit primary user session may build a personal profile.
        self._write_enabled = kwargs.get("agent_context") == "primary"
        native_paths: tuple[Path, Path] | None = None
        if self._config.get("enable_native_memory_editor"):
            native_paths = (hermes_home / "memories" / "USER.md", hermes_home / "memories" / "MEMORY.md")
        self._bridge = RuntimeBridge(_PLUGIN_DIR, self._data_dir, self._config, native_paths)
        try:
            self._bridge.start()
            self._write_runtime_state(kwargs.get("agent_context", ""))
        except Exception:
            self._bridge.stop()
            self._bridge = None
            raise

    def system_prompt_block(self) -> str:
        return "B1ack Dream provides independent, user-controlled recall. Treat entries labelled 观察中 as unconfirmed signals, not user facts."

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        self._last_recall = None
        bridge = self._bridge
        if not bridge or not query.strip():
            return ""
        key = (session_id or self._session_id, query)
        try:
            with self._cache_lock:
                result = self._prefetch_cache.pop(key, None)
            if result is None:
                result = bridge.call("recall", {"sessionId": key[0], "query": query}, timeout=0.8)
            count = int(result.get("count", 0)) if isinstance(result, dict) else 0
            if count:
                self._last_recall = RecallStatus(provider_label="B1ack Dream", count=count, glyph="🧠")
            return str(result.get("context", "")) if isinstance(result, dict) else ""
        except Exception as exc:
            logger.warning("B1ack Dream prefetch failed open: %s", exc)
            return ""

    def queue_prefetch(self, query: str, *, session_id: str = "") -> None:
        bridge = self._bridge
        if not bridge or not query.strip():
            return
        key = (session_id or self._session_id, query)
        def warm() -> None:
            try:
                result = bridge.call("recall", {"sessionId": key[0], "query": query}, timeout=1.2)
                with self._cache_lock:
                    self._prefetch_cache[key] = result if isinstance(result, dict) else {}
            except Exception:
                logger.debug("B1ack Dream prefetch warmup failed.", exc_info=True)
        self._executor.submit(warm)

    def recall_status(self) -> Optional[RecallStatus]:
        return self._last_recall

    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "", messages: Optional[List[Dict[str, Any]]] = None) -> None:
        if not self._write_enabled or not self._bridge or not user_content.strip() or not assistant_content.strip():
            return
        active_session = session_id or self._session_id
        source_id = hashlib.sha256(f"{active_session}\0{user_content}\0{assistant_content}".encode("utf-8")).hexdigest()
        bridge = self._bridge
        def archive() -> None:
            try:
                bridge.call("capture_turn", {"sessionId": active_session, "userContent": user_content, "assistantContent": assistant_content, "sourceId": source_id, "messages": messages or []}, timeout=2.0)
            except Exception as exc:
                logger.warning("B1ack Dream turn archive failed: %s", exc)
        self._executor.submit(archive)

    def on_turn_start(self, turn_number: int, message: str, **kwargs: Any) -> None:
        if self._write_enabled:
            self._schedule_dream_if_due()

    def on_session_end(self, messages: List[Dict[str, Any]]) -> None:
        if not self._write_enabled or not self._bridge:
            return
        self._flush_pending(timeout=5.0)
        if self._config.get("automatic_dream", True):
            self._executor.submit(self._run_dream, "session_end")

    def on_pre_compress(self, messages: List[Dict[str, Any]]) -> str:
        # sync_turn is canonical. Before compression we only attempt to retain a
        # final complete user/assistant pair; deterministic source IDs prevent duplicates.
        if not self._write_enabled or not messages:
            return ""
        user, assistant = self._last_complete_pair(messages)
        if user and assistant:
            self.sync_turn(user, assistant, session_id=self._session_id, messages=messages)
        return ""

    def on_session_switch(self, new_session_id: str, **kwargs: Any) -> None:
        self._session_id = new_session_id
        self._last_recall = None
        with self._cache_lock:
            self._prefetch_cache.clear()

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return []

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs: Any) -> str:
        return json.dumps({"success": False, "error": f"B1ack Dream exposes no model-callable tool named {tool_name}."})

    def get_config_schema(self) -> List[Dict[str, Any]]:
        return [
            {"key": "memory_style", "description": "Memory behavior style", "default": "balanced", "choices": ["conservative", "balanced", "active"]},
            {"key": "automatic_dream", "description": "Run a Dream at the end of primary sessions", "default": True, "type": "boolean"},
            {"key": "scheduled_dream_hours", "description": "Run scheduled consolidation at most once per N hours (0 disables)", "default": 24, "type": "integer", "minimum": 0, "maximum": 168},
            {"key": "webui_enabled", "description": "Start the localhost B1ack Dream management UI", "default": True, "type": "boolean"},
            {"key": "webui_port", "description": "Local WebUI port (0 selects an available port)", "default": 0, "type": "integer", "minimum": 0, "maximum": 65535},
            {"key": "enable_native_memory_editor", "description": "Enable explicit USER.md / MEMORY.md editing in the B1ack Dream UI", "default": False, "type": "boolean"},
        ]

    def save_config(self, values: Dict[str, Any], hermes_home: str) -> None:
        data_dir = Path(hermes_home).expanduser() / "b1ack-dream"
        existing = _read_config(data_dir / "config.json")
        merged = {**existing, **{key: value for key, value in values.items() if key in _DEFAULT_CONFIG}}
        _atomic_json_write(data_dir / "config.json", merged)

    def backup_paths(self) -> List[str]:
        # All provider data deliberately lives inside profile-scoped HERMES_HOME;
        # Hermes backup walks it already, so returning it here would duplicate it.
        return []

    def shutdown(self) -> None:
        if self._shutdown:
            return
        self._shutdown = True
        self._flush_pending(timeout=5.0)
        bridge = self._bridge
        self._bridge = None
        if bridge:
            bridge.stop()
        self._executor.shutdown(wait=False, cancel_futures=False)

    def _run_dream(self, trigger: str) -> None:
        if not self._bridge:
            return
        try:
            self._bridge.call("dream", {"trigger": trigger}, timeout=8.0)
            if trigger == "scheduled":
                self._record_scheduled_time()
        except Exception as exc:
            logger.warning("B1ack Dream %s Dream failed: %s", trigger, exc)

    def _schedule_dream_if_due(self) -> None:
        hours = int(self._config.get("scheduled_dream_hours", 0) or 0)
        if hours <= 0 or not self._config_path or self._scheduled_in_flight:
            return
        last = float(self._config.get("last_scheduled_dream_at", 0) or 0)
        if time.time() - last < hours * 3600:
            return
        self._scheduled_in_flight = True
        def scheduled() -> None:
            try:
                self._run_dream("scheduled")
            finally:
                self._scheduled_in_flight = False
        self._executor.submit(scheduled)

    def _record_scheduled_time(self) -> None:
        if self._config_path:
            self._config["last_scheduled_dream_at"] = time.time()
            _atomic_json_write(self._config_path, self._config)

    def _write_runtime_state(self, agent_context: str) -> None:
        if not self._data_dir or not self._bridge:
            return
        _atomic_json_write(self._data_dir / "runtime.json", {"web_ui": self._bridge.web_ui, "pid": os.getpid(), "session_id": self._session_id, "agent_context": agent_context})

    def _flush_pending(self, timeout: float) -> None:
        if self._shutdown and self._bridge is None:
            return
        try:
            sentinel = self._executor.submit(lambda: None)
            sentinel.result(timeout=timeout)
            if self._bridge:
                self._bridge.call("flush", timeout=timeout)
        except Exception:
            logger.warning("B1ack Dream shutdown/session flush timed out.", exc_info=True)

    @staticmethod
    def _last_complete_pair(messages: List[Dict[str, Any]]) -> tuple[str, str]:
        user = ""
        for message in reversed(messages):
            if not isinstance(message, dict):
                continue
            role = message.get("role")
            content = message.get("content")
            if not isinstance(content, str):
                continue
            if role == "assistant" and not user:
                user = "\0" + content
            elif role == "user" and user:
                return content, user[1:]
        return "", ""


def register(ctx: Any) -> None:
    ctx.register_memory_provider(B1ackDreamMemoryProvider())
