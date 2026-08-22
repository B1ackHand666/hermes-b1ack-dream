"""Authenticated Hermes Dashboard API for the active B1ack Dream runtime.

Hermes mounts ``router`` at ``/api/plugins/b1ack-dream``.  This adapter only
proxies an explicit allow-list to the profile-local sidecar; it does not
duplicate Memory Center rules or expose arbitrary files, methods or paths.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response

import sys

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
_RUNTIME_MODULE = "_b1ack_dream_runtime_state"
_runtime_state = sys.modules.get(_RUNTIME_MODULE)
if _runtime_state is None:
    _runtime_spec = importlib.util.spec_from_file_location(_RUNTIME_MODULE, PLUGIN_ROOT / "runtime_state.py")
    if _runtime_spec is None or _runtime_spec.loader is None:
        raise RuntimeError("B1ack Dream runtime state module is unavailable.")
    _runtime_state = importlib.util.module_from_spec(_runtime_spec)
    sys.modules[_RUNTIME_MODULE] = _runtime_state
    _runtime_spec.loader.exec_module(_runtime_state)
runtime_status = _runtime_state.runtime_status


router = APIRouter()
PREFIX = "/api/plugins/b1ack-dream"
MEMORY_TYPES = {"fact", "preference", "goal", "project", "habit", "person", "place", "event", "learning", "collaboration", "other"}
MEMORY_STATES = {"recent", "observed", "long_term", "pinned", "archived"}


def _hermes_home() -> Path:
    try:
        from hermes_constants import get_hermes_home

        return Path(get_hermes_home()).expanduser().resolve()
    except Exception:
        return Path(os.environ.get("HERMES_HOME", "~/.hermes")).expanduser().resolve()


def _provider_selected() -> bool | None:
    try:
        from plugins.memory import _get_active_memory_provider

        return _get_active_memory_provider() == "b1ack-dream"
    except Exception:
        # Dashboard can remain useful when a host revision lacks this helper;
        # do not imply active selection without a verified host signal.
        return None


def _safe_identifier(value: str, label: str) -> str:
    if not value or len(value) > 160 or "/" in value or "\\" in value or ".." in value:
        raise HTTPException(status_code=400, detail=f"Invalid {label}.")
    return value


def _body(body: Any, *, allowed: set[str], required: set[str] | None = None) -> dict[str, Any]:
    if not isinstance(body, dict) or set(body) - allowed:
        raise HTTPException(status_code=400, detail="Request body is invalid.")
    missing = (required or set()) - set(body)
    if missing:
        raise HTTPException(status_code=400, detail="Request body is incomplete.")
    return body


def _online() -> dict[str, Any]:
    status = runtime_status(_hermes_home(), repair_stale=True)
    if not status["running"]:
        raise HTTPException(status_code=503, detail={"code": "provider_offline", "message": "B1ack Dream provider is not currently running.", "status": status})
    return status


def _sidecar_request(method: str, path: str, *, query: dict[str, str] | None = None, body: dict[str, Any] | None = None) -> tuple[int, Any]:
    status = _online()
    web_ui = status["web_ui"]
    assert isinstance(web_ui, dict)
    suffix = f"?{urlencode(query)}" if query else ""
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    request = Request(
        f"http://{web_ui['host']}:{web_ui['port']}{path}{suffix}", data=payload,
        method=method, headers={"Content-Type": "application/json"} if payload is not None else {},
    )
    try:
        with urlopen(request, timeout=3.0) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            return error.code, json.loads(raw) if raw else {"error": "B1ack Dream request failed."}
        except json.JSONDecodeError:
            return error.code, {"error": "B1ack Dream request failed."}
    except (OSError, URLError, ValueError) as error:
        raise HTTPException(status_code=503, detail={"code": "sidecar_unreachable", "message": "B1ack Dream provider is not currently running."}) from error


async def _proxy(method: str, path: str, *, query: dict[str, str] | None = None, body: dict[str, Any] | None = None) -> Response:
    status, value = await asyncio.to_thread(_sidecar_request, method, path, query=query, body=body)
    if status == 204:
        return Response(status_code=204)
    return JSONResponse(status_code=status, content=value)


@router.get("/status")
async def status() -> dict[str, Any]:
    runtime = await asyncio.to_thread(runtime_status, _hermes_home(), repair_stale=True)
    return {
        "installed": True,
        "provider_selected": _provider_selected(),
        "runtime": runtime,
        "dashboard_path": "/b1ack-dream",
    }


@router.get("/dashboard")
async def dashboard() -> Response:
    return await _proxy("GET", "/api/dashboard")


@router.get("/memories")
async def memories(state: str | None = None, q: str | None = None, archived: bool = False) -> Response:
    if state and state not in MEMORY_STATES:
        raise HTTPException(status_code=400, detail="Invalid memory state.")
    query = {key: value for key, value in {"state": state, "q": q, "archived": "true" if archived else None}.items() if value}
    return await _proxy("GET", "/api/memories", query=query)


@router.get("/memories/{memory_id}")
async def memory_detail(memory_id: str) -> Response:
    return await _proxy("GET", f"/api/memories/{_safe_identifier(memory_id, 'memory id')}/detail")


@router.patch("/memories/{memory_id}")
async def update_memory(memory_id: str, body: dict[str, Any]) -> Response:
    value = _body(body, allowed={"title", "content", "type"}, required={"title", "content", "type"})
    if not all(isinstance(value.get(key), str) and value[key].strip() for key in ("title", "content", "type")) or value["type"] not in MEMORY_TYPES:
        raise HTTPException(status_code=400, detail="Memory update is invalid.")
    return await _proxy("PATCH", f"/api/memories/{_safe_identifier(memory_id, 'memory id')}", body=value)


@router.post("/memories/{memory_id}/pin")
async def pin(memory_id: str) -> Response:
    return await _proxy("POST", f"/api/memories/{_safe_identifier(memory_id, 'memory id')}/pin", body={})


@router.post("/memories/{memory_id}/unpin")
async def unpin(memory_id: str) -> Response:
    return await _proxy("POST", f"/api/memories/{_safe_identifier(memory_id, 'memory id')}/unpin", body={})


@router.post("/memories/{memory_id}/archive")
async def archive(memory_id: str) -> Response:
    return await _proxy("POST", f"/api/memories/{_safe_identifier(memory_id, 'memory id')}/archive", body={})


@router.post("/memories/{memory_id}/restore")
async def restore(memory_id: str) -> Response:
    return await _proxy("POST", f"/api/memories/{_safe_identifier(memory_id, 'memory id')}/restore", body={})


@router.delete("/memories/{memory_id}")
async def delete(memory_id: str, body: dict[str, Any] | None = None) -> Response:
    value = _body(body or {}, allowed={"preventRelearning", "related"})
    if any(not isinstance(value.get(key), bool) for key in value):
        raise HTTPException(status_code=400, detail="Delete options are invalid.")
    return await _proxy("DELETE", f"/api/memories/{_safe_identifier(memory_id, 'memory id')}", body=value)


@router.post("/memories/{memory_id}/observed")
async def decide_observed(memory_id: str, body: dict[str, Any]) -> Response:
    value = _body(body, allowed={"action"}, required={"action"})
    if value.get("action") not in {"confirm", "continue", "recent", "ignore"}:
        raise HTTPException(status_code=400, detail="Observed decision is invalid.")
    return await _proxy("POST", f"/api/memories/{_safe_identifier(memory_id, 'memory id')}/observed", body=value)


@router.get("/inbox")
async def inbox() -> Response:
    return await _proxy("GET", "/api/inbox")


@router.post("/inbox/{inbox_id}/resolve")
async def resolve_inbox(inbox_id: str, body: dict[str, Any]) -> Response:
    value = _body(body, allowed={"action"}, required={"action"})
    if value.get("action") not in {"confirm", "continue", "recent", "keep_old", "use_new"}:
        raise HTTPException(status_code=400, detail="Inbox decision is invalid.")
    return await _proxy("POST", f"/api/inbox/{_safe_identifier(inbox_id, 'inbox id')}/resolve", body=value)


@router.get("/dreams")
async def dreams() -> Response:
    return await _proxy("GET", "/api/dreams")


@router.post("/dream")
async def dream() -> Response:
    return await _proxy("POST", "/api/dream", body={})


@router.get("/recalls")
async def recalls() -> Response:
    return await _proxy("GET", "/api/recalls")


@router.get("/settings")
async def settings() -> Response:
    return await _proxy("GET", "/api/settings")


@router.patch("/settings")
async def update_settings(body: dict[str, Any]) -> Response:
    value = _body(body, allowed={"memoryStyle", "automaticDream", "autoPromoteObserved", "observedDays", "recentDays", "dormantDays", "archiveDays", "recallLimit"})
    return await _proxy("PATCH", "/api/settings", body=value)


@router.get("/native/{target}")
async def native_view(target: str) -> Response:
    if target not in {"user", "memory"}:
        raise HTTPException(status_code=404, detail="Native memory target not found.")
    return await _proxy("GET", f"/api/native/{target}")


@router.post("/native/{target}")
async def write_native(target: str, body: dict[str, Any]) -> Response:
    if target not in {"user", "memory"}:
        raise HTTPException(status_code=404, detail="Native memory target not found.")
    value = _body(body, allowed={"content", "confirmed"}, required={"content", "confirmed"})
    if not isinstance(value.get("content"), str) or value.get("confirmed") is not True:
        raise HTTPException(status_code=400, detail="Native memory writes require previewed content and explicit confirmation.")
    return await _proxy("POST", f"/api/native/{target}", body=value)


@router.post("/native/{target}/restore")
async def restore_native(target: str, body: dict[str, Any]) -> Response:
    if target not in {"user", "memory"}:
        raise HTTPException(status_code=404, detail="Native memory target not found.")
    value = _body(body, allowed={"versionId", "confirmed"}, required={"versionId", "confirmed"})
    if not isinstance(value.get("versionId"), str) or value.get("confirmed") is not True:
        raise HTTPException(status_code=400, detail="Native memory restore requires explicit confirmation.")
    return await _proxy("POST", f"/api/native/{target}/restore", body=value)


@router.post("/copy-to-native")
async def copy_to_native(body: dict[str, Any]) -> Response:
    value = _body(body, allowed={"memoryId", "target", "content", "confirmed"}, required={"memoryId", "target", "content", "confirmed"})
    if not isinstance(value.get("memoryId"), str) or value.get("target") not in {"user", "memory"} or not isinstance(value.get("content"), str) or value.get("confirmed") is not True:
        raise HTTPException(status_code=400, detail="Copy requires a target, previewed content and explicit confirmation.")
    _safe_identifier(value["memoryId"], "memory id")
    return await _proxy("POST", "/api/copy-to-native", body=value)
