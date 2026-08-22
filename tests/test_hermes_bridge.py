"""Focused Python tests for Node compatibility and stale runtime recovery."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins" / "hermes"
sys.path.insert(0, str(PLUGIN))

bridge_spec = importlib.util.spec_from_file_location("b1ack_dream_bridge", PLUGIN / "bridge.py")
assert bridge_spec and bridge_spec.loader
bridge = importlib.util.module_from_spec(bridge_spec)
sys.modules[bridge_spec.name] = bridge
bridge_spec.loader.exec_module(bridge)

from runtime_state import runtime_path, runtime_status  # noqa: E402

installer_spec = importlib.util.spec_from_file_location("b1ack_dream_installer", ROOT / "scripts" / "install_hermes_plugin.py")
assert installer_spec and installer_spec.loader
installer = importlib.util.module_from_spec(installer_spec)
sys.modules[installer_spec.name] = installer
installer_spec.loader.exec_module(installer)


class NodeVersionTests(unittest.TestCase):
    @staticmethod
    def _completed(version: str, code: int = 0) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(["node", "--version"], code, stdout=version, stderr="")

    def test_missing_node_is_unavailable(self) -> None:
        with patch.object(bridge.RuntimeBridge, "node_path", return_value=None):
            self.assertIn("not found", bridge.RuntimeBridge.node_unavailable_reason())

    def test_node_18_is_unavailable(self) -> None:
        with patch.object(bridge.RuntimeBridge, "node_path", return_value="node"), patch.object(bridge.subprocess, "run", return_value=self._completed("v18.19.1\n")):
            self.assertEqual(bridge.RuntimeBridge.node_unavailable_reason(), "Node.js 18.19.1 detected. B1ack Dream requires Node.js 20 or newer.")

    def test_node_20_is_available(self) -> None:
        with patch.object(bridge.RuntimeBridge, "node_path", return_value="node"), patch.object(bridge.subprocess, "run", return_value=self._completed("v20.18.3\n")):
            self.assertIsNone(bridge.RuntimeBridge.node_unavailable_reason())

    def test_node_22_or_newer_is_available(self) -> None:
        with patch.object(bridge.RuntimeBridge, "node_path", return_value="node"), patch.object(bridge.subprocess, "run", return_value=self._completed("v22.14.0\n")):
            self.assertIsNone(bridge.RuntimeBridge.node_unavailable_reason())

    def test_malformed_version_fails_closed_and_start_rechecks(self) -> None:
        with patch.object(bridge.RuntimeBridge, "node_path", return_value="node"), patch.object(bridge.subprocess, "run", return_value=self._completed("node twenty\n")):
            self.assertIn("could not be verified", bridge.RuntimeBridge.node_unavailable_reason())
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            runtime = root / "runtime"
            runtime.mkdir()
            (runtime / "hermes-sidecar.js").write_text("// test", encoding="utf-8")
            instance = bridge.RuntimeBridge(root, root / "data", {})
            with patch.object(bridge.RuntimeBridge, "require_compatible_node", side_effect=bridge.BridgeError("Node rejected")):
                with self.assertRaisesRegex(bridge.BridgeError, "Node rejected"):
                    instance.start()


class RuntimeStateTests(unittest.TestCase):
    def test_stale_state_repairs_to_stopped(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            state_file = runtime_path(home)
            state_file.parent.mkdir(parents=True)
            state_file.write_text(json.dumps({
                "running": True,
                "provider_pid": None,
                "sidecar_pid": None,
                "started_at": "2026-01-01T00:00:00+00:00",
                "stopped_at": None,
                "web_ui": {"host": "127.0.0.1", "port": 9},
            }), encoding="utf-8")
            status = runtime_status(home, repair_stale=True)
            self.assertFalse(status["running"])
            repaired = json.loads(state_file.read_text(encoding="utf-8"))
            self.assertFalse(repaired["running"])
            self.assertIsNone(repaired["web_ui"])


class InstallerTests(unittest.TestCase):
    def test_enable_dashboard_uses_official_hermes_opt_in(self) -> None:
        with tempfile.TemporaryDirectory() as temporary, patch.object(
            installer.subprocess,
            "run",
            return_value=subprocess.CompletedProcess(["hermes"], 0, stdout="enabled", stderr=""),
        ) as run:
            installer.enable_dashboard_plugin(Path(temporary), executable="hermes")
        command = run.call_args.args[0]
        self.assertEqual(command, ["hermes", "plugins", "enable", "b1ack-dream", "--no-allow-tool-override"])
        self.assertEqual(run.call_args.kwargs["env"]["HERMES_HOME"], str(Path(temporary)))


if __name__ == "__main__":
    unittest.main()
