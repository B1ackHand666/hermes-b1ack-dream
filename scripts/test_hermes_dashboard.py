#!/usr/bin/env python3
"""Real Hermes Dashboard plugin contract test against a checked-out Hermes tree."""

from __future__ import annotations

import argparse
import asyncio
import importlib
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[1]
_INSTALLER_SPEC = importlib.util.spec_from_file_location("b1ack_dream_dashboard_installer", REPOSITORY / "scripts" / "install_hermes_plugin.py")
assert _INSTALLER_SPEC and _INSTALLER_SPEC.loader
_INSTALLER = importlib.util.module_from_spec(_INSTALLER_SPEC)
_INSTALLER_SPEC.loader.exec_module(_INSTALLER)
_ARGUMENTS = argparse.ArgumentParser(add_help=False)
_ARGUMENTS.add_argument("--hermes-source", default=os.environ.get("HERMES_SOURCE"))
_OPTIONS, _UNITTEST_ARGS = _ARGUMENTS.parse_known_args()
if not _OPTIONS.hermes_source:
    _ARGUMENTS.error("--hermes-source or HERMES_SOURCE is required")
HERMES_SOURCE = Path(_OPTIONS.hermes_source).resolve()


def request_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def router_is_mounted(app, router, prefix: str) -> bool:
    """Support FastAPI's current lazy ``_IncludedRouter`` representation."""
    return any(
        getattr(route, "original_router", None) is router
        and getattr(getattr(route, "include_context", None), "prefix", None) == prefix
        for route in app.routes
    )


class HermesDashboardContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not (HERMES_SOURCE / "hermes_cli" / "web_server.py").is_file():
            raise RuntimeError("--hermes-source must contain hermes_cli/web_server.py")
        sys.path.insert(0, str(HERMES_SOURCE))
        cls.root = Path(tempfile.mkdtemp(prefix="b1ack-dream-dashboard-contract-"))
        cls.home = cls.root / "profile"
        os.environ["HERMES_HOME"] = str(cls.home)
        plugin = _INSTALLER.install(cls.home, force=False)
        (cls.home / "config.yaml").write_text(
            "memory:\n  provider: b1ack-dream\n",
            encoding="utf-8",
        )
        config = cls.home / "b1ack-dream" / "config.json"
        config.parent.mkdir(parents=True)
        config.write_text(json.dumps({"webui_enabled": True, "scheduled_dream_hours": 0, "enable_native_memory_editor": True}), encoding="utf-8")
        from hermes_cli.config import load_config
        from plugins.memory import load_memory_provider
        setup_provider = load_memory_provider("b1ack-dream")
        assert setup_provider is not None
        setup_provider.post_setup(str(cls.home), load_config())

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.root, ignore_errors=True)

    def test_dashboard_discovery_mount_and_shared_store(self) -> None:
        manifest_path = self.home / "plugins" / "b1ack-dream" / "dashboard" / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["name"], "b1ack-dream")
        self.assertEqual(manifest["tab"]["path"], "/b1ack-dream")
        bundle = manifest_path.parent / manifest["entry"]
        bundle_text = bundle.read_text(encoding="utf-8")
        stylesheet = manifest_path.parent / manifest["css"]
        self.assertTrue(stylesheet.is_file(), "Dashboard manifest stylesheet must be installed")
        self.assertEqual(manifest.get("api"), "plugin_api.py")
        self.assertIn("__HERMES_PLUGIN_SDK__", bundle_text)
        self.assertIn('register("b1ack-dream", Page)', bundle_text)
        self.assertNotIn("<iframe", bundle_text.lower())
        self.assertNotIn("from \"react\"", bundle_text.lower())

        # Importing the real Dashboard server invokes its discovery and route
        # mounting code before the provider starts. The Dashboard is allowed
        # to start first and must later report a graceful offline state.
        self.assertNotIn("hermes_cli.web_server", sys.modules)
        web_server = importlib.import_module("hermes_cli.web_server")
        discovered = web_server._get_dashboard_plugins(force_rescan=True)
        plugin_info = next((item for item in discovered if item["name"] == "b1ack-dream"), None)
        self.assertIsNotNone(plugin_info)
        self.assertTrue(plugin_info.get("has_api"), "Dashboard manifest must expose plugin_api.py")
        from hermes_cli.plugins_cmd import _get_enabled_set
        self.assertIn("b1ack-dream", _get_enabled_set(), "Dashboard backend requires the explicitly enabled user plugin")
        mounted_module = sys.modules.get("hermes_dashboard_plugin_b1ack-dream")
        module = sys.modules.get("hermes_dashboard_plugin_b1ack-dream")
        self.assertIsNotNone(module, "Hermes must import plugin_api.py before mounting routes")
        self.assertTrue(router_is_mounted(web_server.app, module.router, "/api/plugins/b1ack-dream"), "Hermes must mount the B1ack Dream API namespace")
        offline_before = asyncio.run(module.status())
        self.assertFalse(offline_before["runtime"]["running"])

        from plugins.memory import load_memory_provider

        provider = load_memory_provider("b1ack-dream")
        assert provider is not None
        provider.initialize("dashboard-session", hermes_home=str(self.home), platform="cli", agent_context="primary")
        self.addCleanup(provider.shutdown)
        provider.sync_turn("我正在准备国考。", "我会帮助整理复习计划。", session_id="dashboard-session")
        provider._flush_pending(timeout=8.0)

        from fastapi.testclient import TestClient

        client = TestClient(web_server.app)
        headers = {"X-Hermes-Session-Token": web_server._SESSION_TOKEN}
        status_response = client.get("/api/plugins/b1ack-dream/status", headers=headers)
        self.assertEqual(status_response.status_code, 200)
        self.assertTrue(status_response.json()["runtime"]["running"])
        dashboard_response = client.get("/api/plugins/b1ack-dream/dashboard", headers=headers)
        self.assertEqual(dashboard_response.status_code, 200)
        dashboard = dashboard_response.json()
        self.assertIn("recent", dashboard)
        memories_response = client.get("/api/plugins/b1ack-dream/memories", headers=headers)
        self.assertEqual(memories_response.status_code, 200)
        memories = memories_response.json()
        self.assertTrue(memories)
        memory_id = memories[0]["id"]
        pin_response = client.post(f"/api/plugins/b1ack-dream/memories/{memory_id}/pin", headers=headers, json={})
        self.assertEqual(pin_response.status_code, 200)
        copy_response = client.post("/api/plugins/b1ack-dream/copy-to-native", headers=headers, json={
            "memoryId": memory_id,
            "target": "user",
            "content": "用户正在准备国考",
            "confirmed": True,
        })
        self.assertEqual(copy_response.status_code, 204, "Dashboard native-memory copy must retain explicit confirmation")
        self.assertEqual((self.home / "memories" / "USER.md").read_text(encoding="utf-8"), "用户正在准备国考")

        runtime = json.loads((self.home / "b1ack-dream" / "runtime.json").read_text(encoding="utf-8"))
        web = runtime["web_ui"]
        state = request_json(f"http://{web['host']}:{web['port']}/api/state")
        self.assertTrue(any(item["id"] == memory_id and item["state"] == "pinned" for item in state["memories"]), "Dashboard mutation must use the active sidecar Store")

        provider.shutdown()
        offline = client.get("/api/plugins/b1ack-dream/status", headers=headers)
        self.assertEqual(offline.status_code, 200)
        self.assertFalse(offline.json()["runtime"]["running"])


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0], *_UNITTEST_ARGS])
