import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AddressInfo } from "node:net";
import test from "node:test";
import { createMemoryCenter, type NativeMemoryAdapter } from "../src/memory-center.js";
import { createMemoryCenterServer } from "../src/server.js";
import { JsonMemoryStore } from "../src/store.js";

const setup = async () => {
  const folder = await mkdtemp(join(tmpdir(), "hermes-memory-center-"));
  const store = new JsonMemoryStore(join(folder, "memory-center.json"));
  return { folder, center: createMemoryCenter(store) };
};

test("candidate lifecycle remains user-controlled and auditable", async (t) => {
  const { folder, center } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  await center.capture({ conversationId: "c1", content: "User preference concise answers.", at: "2026-01-01T00:00:00.000Z" });
  await center.capture({ conversationId: "c2", content: "User preference concise answers.", at: "2026-01-02T00:00:00.000Z" });
  await center.capture({ conversationId: "c3", content: "User preference concise answers.", at: "2026-01-03T00:00:00.000Z" });
  await center.runDream();
  const observed = (await center.listMemories({ state: "observed" }))[0];
  assert.ok(observed, "repeated evidence should become an observation");
  assert.equal(observed.authority, "observed");
  assert.equal((await center.state()).inbox.length, 1, "default settings ask before promotion");
  await center.decideObserved(observed.id, "confirm");
  const longTerm = await center.getMemory(observed.id);
  assert.equal(longTerm?.state, "long_term");
  assert.equal(longTerm?.authority, "user_confirmed");
  assert.ok((await center.state()).timeline.some((event) => event.action === "promoted_to_long_term"));
});

test("boundary blocks future capture and deleted data is removed", async (t) => {
  const { folder, center } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  await center.capture({ conversationId: "c1", content: "Project Atlas is important.", at: "2026-01-01T00:00:00.000Z" });
  const memory = (await center.listMemories({ state: "recent" }))[0];
  await center.deleteMemory(memory.id, { preventRelearning: true });
  assert.equal(await center.getMemory(memory.id), undefined);
  await center.capture({ conversationId: "c2", content: "Project Atlas is important.", at: "2026-01-02T00:00:00.000Z" });
  assert.equal((await center.listMemories()).length, 0, "Boundary must execute during Capture");
  assert.ok((await center.state()).audit.some((event) => event.action === "capture_blocked_by_boundary"));
});

test("memory-specific boundary suppresses an existing memory during Recall", async (t) => {
  const { folder, center } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  await center.capture({ conversationId: "c1", content: "User preference concise answers.", at: "2026-01-01T00:00:00.000Z" });
  const memory = (await center.listMemories())[0];
  await center.pin(memory.id);
  await center.createBoundary("memory", memory.id, "Do not use this particular memory.");
  const recall = await center.recall("answer-1", "concise answers");
  assert.equal(recall.memories.length, 0, "Memory boundary must execute during Recall");
});

test("recall favors pinned stable memory and records transparency", async (t) => {
  const { folder, center } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  await center.capture({ conversationId: "c1", content: "User preference concise answers.", at: "2026-01-01T00:00:00.000Z" });
  const memory = (await center.listMemories({ state: "recent" }))[0];
  await center.pin(memory.id);
  const result = await center.recall("answer-1", "preference concise answers");
  assert.equal(result.memories[0]?.memory.id, memory.id);
  assert.match(result.context, /固定记忆/);
  assert.equal((await center.state()).recalls[0]?.includedInContext, true);
});

test("native memory is touched only after an explicit confirmed copy", async (t) => {
  const { folder } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  const writes: string[] = [];
  const native: NativeMemoryAdapter = { available: true, read: async () => "# Existing", write: async (_target, content) => { writes.push(content); } };
  const center = createMemoryCenter(new JsonMemoryStore(join(folder, "memory-center.json")), native);
  await center.capture({ conversationId: "c1", content: "User preference concise answers.", at: "2026-01-01T00:00:00.000Z" });
  const memory = (await center.listMemories())[0];
  await center.pin(memory.id);
  await center.runDream();
  assert.equal(writes.length, 0, "Capture, Dream and Pin must not write Hermes native memory");
  await assert.rejects(() => center.copyMemoryToNative(memory.id, "user", "User preference concise answers.", false));
  assert.equal(writes.length, 0);
  await center.copyMemoryToNative(memory.id, "user", "User preference concise answers.", true);
  assert.deepEqual(writes, ["User preference concise answers."]);
  assert.equal((await center.state()).nativeMemoryHistory[0]?.action, "copy");
});

test("local WebUI and API expose live Hermes B1ack Dream data", async (t) => {
  const { folder, center } = await setup();
  const server = createMemoryCenterServer(center);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(folder, { recursive: true, force: true });
  });
  const port = (server.address() as AddressInfo).port;
  const home = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Hermes B1ack Dream/);
  const capture = await fetch(`http://127.0.0.1:${port}/api/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId: "web-1", content: "User preference concise answers." }),
  });
  assert.equal(capture.status, 201);
  const dashboard = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
  assert.equal((await dashboard.json() as { recent: number }).recent, 1);
});
