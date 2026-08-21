#!/usr/bin/env python3
"""Real Hermes MemoryProvider contract test against a checked-out Hermes tree."""

from __future__ import annotations

import argparse
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
_ARGUMENTS = argparse.ArgumentParser(add_help=False)
_ARGUMENTS.add_argument("--hermes-source", default=os.environ.get("HERMES_SOURCE"))
_OPTIONS, _UNITTEST_ARGS = _ARGUMENTS.parse_known_args()
if not _OPTIONS.hermes_source:
    _ARGUMENTS.error("--hermes-source or HERMES_SOURCE is required")
HERMES_SOURCE = Path(_OPTIONS.hermes_source).resolve()


def request_json(url: str, method: str = "GET", data: dict | None = None) -> dict | list | None:
    body = json.dumps(data).encode("utf-8") if data is not None else None
    request = urllib.request.Request(url, data=body, method=method, headers={"Content-Type": "application/json"} if body else {})
    with urllib.request.urlopen(request, timeout=5) as response:
        return None if response.status == 204 else json.loads(response.read().decode("utf-8"))


class HermesProviderContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.hermes_source = HERMES_SOURCE
        if not (cls.hermes_source / "agent" / "memory_provider.py").is_file():
            raise RuntimeError("--hermes-source must be a Hermes checkout containing agent/memory_provider.py")
        sys.path.insert(0, str(cls.hermes_source))
        cls.root = Path(tempfile.mkdtemp(prefix="b1ack-dream-hermes-contract-"))
        cls.home_a = cls.root / "profile-a"
        cls.home_b = cls.root / "profile-b"
        os.environ["HERMES_HOME"] = str(cls.home_a)
        cls._install(cls.home_a)
        cls._install(cls.home_b)

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.root, ignore_errors=True)

    @staticmethod
    def _install(home: Path) -> None:
        plugin = home / "plugins" / "b1ack-dream"
        plugin.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(REPOSITORY / "plugins" / "hermes", plugin)
        config = home / "b1ack-dream" / "config.json"
        config.parent.mkdir(parents=True, exist_ok=True)
        config.write_text(json.dumps({"enable_native_memory_editor": True, "webui_enabled": True}), encoding="utf-8")

    def test_provider_discovery_lifecycle_and_profile_isolation(self) -> None:
        from plugins.memory import discover_memory_providers, load_memory_provider
        from plugins.memory.config_schema import get_provider_config_schema

        discovered = {name: available for name, _description, available in discover_memory_providers()}
        self.assertTrue(discovered.get("b1ack-dream"), "Hermes must discover an available b1ack-dream user plugin")
        schema = get_provider_config_schema("b1ack-dream")
        self.assertIsNotNone(schema, "Hermes dashboard must load the provider's declarative configuration")
        self.assertTrue({"memory_style", "automatic_dream", "webui_enabled"}.issubset({field.key for field in schema.fields}))
        provider = load_memory_provider("b1ack-dream")
        self.assertIsNotNone(provider, "Hermes must load the selected provider")
        assert provider is not None
        self.assertTrue(provider.is_available())
        self.assertEqual(provider.name, "b1ack-dream")
        provider.initialize("session-1", hermes_home=str(self.home_a), platform="cli", agent_context="primary")
        self.addCleanup(provider.shutdown)

        started = time.monotonic()
        provider.sync_turn("我正在准备 2027 国考。", "我会协助你制定复习计划。", session_id="session-1")
        self.assertLess(time.monotonic() - started, 0.25, "sync_turn must return without waiting for persistent work")
        provider.sync_turn("最近开始认真做行测。", "我们可以从每日练习开始。", session_id="session-2")
        provider.sync_turn("我在研究国考职位表。", "我会帮你整理筛选条件。", session_id="session-3")
        provider._flush_pending(timeout=8.0)  # Contract verification after the explicitly non-blocking calls.

        context = provider.prefetch("公务员考试怎么复习？", session_id="session-4")
        self.assertIsInstance(context, str)
        self.assertIn("国考", context)
        self.assertIsNotNone(provider.recall_status())
        self.assertGreater(provider.recall_status().count, 0)

        provider.on_turn_start(1, "当前回合")
        provider.on_session_end([])
        provider._flush_pending(timeout=8.0)
        runtime = json.loads((self.home_a / "b1ack-dream" / "runtime.json").read_text(encoding="utf-8"))
        web_ui = runtime["web_ui"]
        self.assertEqual(web_ui["host"], "127.0.0.1")
        base = f"http://{web_ui['host']}:{web_ui['port']}/api"
        state = request_json(f"{base}/state")
        self.assertGreaterEqual(len(state["conversations"]), 3)
        self.assertGreaterEqual(len(state["dreams"]), 2, "Scheduled and session-end Dream must both run through real Hermes hooks")
        self.assertFalse((self.home_a / "memories" / "USER.md").exists(), "Capture and Dream must not modify USER.md")
        self.assertEqual(provider.backup_paths(), [], "Provider data is inside HERMES_HOME and is backed up by Hermes itself")

        memory = next(item for item in state["memories"] if item["state"] != "archived")
        request_json(f"{base}/memories/{memory['id']}/pin", "POST", {})
        request_json(f"{base}/copy-to-native", "POST", {"memoryId": memory["id"], "target": "user", "content": "用户正在准备国考", "confirmed": True})
        self.assertEqual((self.home_a / "memories" / "USER.md").read_text(encoding="utf-8"), "用户正在准备国考")
        state_after_copy = request_json(f"{base}/state")
        self.assertTrue(state_after_copy["nativeMemoryHistory"])

        provider.shutdown()
        restarted = provider.__class__()
        restarted.initialize("session-restart", hermes_home=str(self.home_a), platform="cli", agent_context="primary")
        self.addCleanup(restarted.shutdown)
        self.assertIn("国考", restarted.prefetch("公务员考试怎么复习？", session_id="session-restart"))
        restarted.shutdown()

        isolated = provider.__class__()
        isolated.initialize("profile-b", hermes_home=str(self.home_b), platform="cli", agent_context="primary")
        self.addCleanup(isolated.shutdown)
        self.assertEqual(isolated.prefetch("公务员考试怎么复习？", session_id="profile-b"), "")
        isolated.shutdown()


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0], *_UNITTEST_ARGS])
