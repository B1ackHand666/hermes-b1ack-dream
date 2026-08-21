/** Lightweight local V1 capacity check; run after `npm run build`. */
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryCenter } from "../dist/src/memory-center.js";
import { createMemoryCenterServer } from "../dist/src/server.js";
import { JsonMemoryStore } from "../dist/src/store.js";

const now = new Date().toISOString();
const measure = async (work) => {
  const started = performance.now();
  await work();
  return Math.round((performance.now() - started) * 10) / 10;
};

for (const count of [100, 1_000, 5_000]) {
  const folder = await mkdtemp(join(tmpdir(), "b1ack-dream-benchmark-"));
  const path = join(folder, "memory-center.json");
  const store = new JsonMemoryStore(path);
  await store.transaction((state) => {
    for (let index = 0; index < count; index += 1) state.memories.push({
      id: `memory-${index}`, title: `公务员考试复习目标 ${index}`, content: `用户正在准备国考，复习计划条目 ${index}。`, type: "goal", state: "long_term", lifecycle: "stable", authority: "user_confirmed", createdAt: now, updatedAt: now, firstDiscoveredAt: now, lastReinforcedAt: now, recalledCount: 0, userConfirmed: true, pinned: false, topic: "公务员考试", evidence: [], relatedTraceIds: [], relatedConversationIds: ["benchmark"], createdBy: "user",
    });
  });
  const center = createMemoryCenter(store);
  const recallMs = await measure(() => center.recall("benchmark", "公务员考试怎么复习？", 6));
  const dreamMs = await measure(() => center.runDream());
  const server = createMemoryCenterServer(center);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Benchmark WebUI has no TCP address.");
  const port = address.port;
  const webUiMs = await measure(async () => { const response = await fetch(`http://127.0.0.1:${port}/api/memories?state=long_term`); if (!response.ok) throw new Error(`WebUI query failed: ${response.status}`); await response.arrayBuffer(); });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  const bytes = (await stat(path)).size;
  console.log(JSON.stringify({ memories: count, recallMs, dreamMs, webUiMs, storeKiB: Math.round(bytes / 1024) }, null, 2));
  await rm(folder, { recursive: true, force: true });
}
