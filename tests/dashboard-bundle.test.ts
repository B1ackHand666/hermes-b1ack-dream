import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

test("Dashboard bundle registers a native B1ack Dream page through the Hermes SDK", async () => {
  const bundle = await readFile(resolve("plugins/hermes/dashboard/dist/index.js"), "utf8");
  let registration: { name: string; component: unknown } | undefined;
  const window = {
    __HERMES_PLUGIN_SDK__: {
      React: { createElement: () => null },
      hooks: { useCallback: (value: unknown) => value, useEffect: () => undefined, useMemo: (value: () => unknown) => value(), useState: (value: unknown) => [value, () => undefined] },
      components: {},
      fetchJSON: async () => ({}),
    },
    __HERMES_PLUGINS__: { register: (name: string, component: unknown) => { registration = { name, component }; } },
  };
  vm.runInNewContext(bundle, { window, setInterval, clearInterval });
  assert.equal(registration?.name, "b1ack-dream");
  assert.equal(typeof registration?.component, "function");
  assert.doesNotMatch(bundle, /<iframe/i);
  assert.doesNotMatch(bundle, /from\s+["']react["']/i);
});
