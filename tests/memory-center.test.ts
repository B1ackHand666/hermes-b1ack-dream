import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createMemoryCenter, type NativeMemoryAdapter } from "../src/memory-center.js";
import { createMemoryCenterServer } from "../src/server.js";
import { JsonMemoryStore, migrateState } from "../src/store.js";

const setup = async () => {
  const folder = await mkdtemp(join(tmpdir(), "hermes-memory-center-"));
  const store = new JsonMemoryStore(join(folder, "memory-center.json"));
  return { folder, center: createMemoryCenter(store) };
};

const requestLocal = async (url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: string }> => new Promise((resolve, reject) => {
  const request = httpRequest(url, { method: options.method, headers: options.headers }, (response) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
  });
  request.on("error", reject);
  if (options.body) request.write(options.body);
  request.end();
});

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
  assert.equal((await center.state()).recalls[0]?.contextStatus, "selected");
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
  await center.updateMemory(memory.id, { title: memory.title, content: "User preference detailed answers for complex questions.", type: memory.type });
  assert.equal(writes.length, 1, "Editing a plugin memory must not synchronize its native copy");
  await center.copyMemoryToNative(memory.id, "memory", "Long-term note copied by the user.", true);
  assert.deepEqual(writes, ["User preference concise answers.", "Long-term note copied by the user."]);
});

test("Chinese variants aggregate and recall through the formal lifecycle", async (t) => {
  const { folder, center } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  await center.capture({ conversationId: "s1", content: "我准备参加 2027 国考。", at: "2026-01-01T00:00:00.000Z" });
  await center.capture({ conversationId: "s2", content: "最近开始认真备考公务员考试。", at: "2026-01-02T00:00:00.000Z" });
  await center.capture({ conversationId: "s3", content: "我在研究国考职位表和行测。", at: "2026-01-03T00:00:00.000Z" });
  await center.runDream();
  const observed = (await center.listMemories({ state: "observed" }));
  assert.equal(observed.length, 1, "Chinese aliases must reinforce one explainable candidate");
  assert.equal(observed[0]?.topic, "公务员考试");
  const result = await center.recall("s4", "公务员考试怎么复习？");
  assert.equal(result.memories[0]?.memory.id, observed[0]?.id);
  assert.match(result.context, /观察中，尚未确认/);
});

test("completed turns archive user, assistant and tool provenance without profiling tool text", async (t) => {
  const { folder, center } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  await center.captureCompletedTurn({
    conversationId: "complete-1",
    sourceId: "turn-1",
    userContent: "我正在准备国考。",
    assistantContent: "我会帮你拆分行测复习计划。",
    messages: [{ role: "tool", content: "tool result: internal retrieval payload" }, { role: "function", content: { result: "structured tool output" } }],
  });
  const conversation = (await center.state()).conversations.find((item) => item.id === "complete-1")!;
  assert.deepEqual(conversation.messages.map((message) => message.role).sort(), ["assistant", "function", "tool", "user"]);
  assert.ok((await center.listMemories()).every((memory) => !memory.content.includes("internal retrieval payload")));
});

test("resolved conflict stays closed until material new evidence and use_new replaces atomically", async (t) => {
  const { folder, center } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  for (const day of ["01", "02", "03"]) await center.capture({ conversationId: `old-${day}`, content: "用户喜欢简短回答。", at: `2026-01-${day}T00:00:00.000Z` });
  await center.runDream();
  const old = (await center.listMemories({ state: "observed" }))[0]!;
  await center.decideObserved(old.id, "confirm");
  for (const day of ["04", "05", "06"]) await center.capture({ conversationId: `new-${day}`, content: "复杂问题以后给我详细讲。", at: `2026-01-${day}T00:00:00.000Z` });
  await center.runDream();
  const conflict = (await center.state()).inbox.find((item) => item.kind === "conflict");
  assert.ok(conflict, "opposite answer-style preferences must not overwrite silently");
  await center.resolveInbox(conflict!.id, "keep_old");
  await center.runDream();
  assert.equal((await center.state()).inbox.filter((item) => item.status === "open" && item.kind === "conflict").length, 0, "keep_old must suppress the same evidence");
  await center.capture({ conversationId: "new-07", content: "复杂问题以后给我详细讲。", at: "2026-01-07T00:00:00.000Z" });
  await center.runDream();
  const reopened = (await center.state()).inbox.find((item) => item.status === "open" && item.kind === "conflict");
  assert.ok(reopened, "new material evidence may reopen a resolved conflict");
  await center.resolveInbox(reopened!.id, "use_new");
  assert.equal((await center.getMemory(old.id))?.state, "archived");
  assert.equal((await center.getMemory(reopened!.memoryId))?.state, "long_term");
  assert.equal((await center.getMemory(reopened!.memoryId))?.authority, "user_confirmed");
});

test("archive restores its original state and native restore restores the displayed version", async (t) => {
  const { folder } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  let nativeContent = "first";
  const native: NativeMemoryAdapter = { available: true, read: async () => nativeContent, write: async (_target, content) => { nativeContent = content; } };
  const center = createMemoryCenter(new JsonMemoryStore(join(folder, "memory-center.json")), native);
  await center.capture({ conversationId: "c1", content: "User preference concise answers.", at: "2026-01-01T00:00:00.000Z" });
  const memory = (await center.listMemories())[0]!;
  await center.pin(memory.id);
  await center.unpin(memory.id);
  await center.archive(memory.id);
  await center.restore(memory.id);
  assert.equal((await center.getMemory(memory.id))?.state, "long_term");
  await center.writeNativeMemory("user", "version one", { confirmed: true });
  const version = (await center.state()).nativeMemoryHistory.at(-1)!;
  await center.writeNativeMemory("user", "version two", { confirmed: true });
  await center.restoreNativeMemory("user", version.id, true);
  assert.equal(nativeContent, "version one", "Restore this version must restore the version users selected");
});

test("schema v1 recall records migrate fail-closed", () => {
  const migrated = migrateState({ schemaVersion: 1, memories: [], conversations: [], traces: [], timeline: [], audit: [], recalls: [{ includedInContext: true }], inbox: [], boundaries: [], dreams: [], nativeMemoryHistory: [], settings: {} });
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.recalls[0]?.contextStatus, "unknown");
});

test("Dream Diary preserves an explicit trigger and serializes runs", async (t) => {
  const { folder, center } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  const [scheduled, sessionEnd] = await Promise.all([center.runDream("scheduled"), center.runDream("session_end")]);
  assert.equal(scheduled.trigger, "scheduled");
  assert.equal(sessionEnd.trigger, "session_end");
  assert.deepEqual((await center.state()).dreams.map((run) => run.trigger), ["scheduled", "session_end"]);
});

test("a failed Dream preserves existing memory and records a partial run", async (t) => {
  const { folder, center } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  await center.capture({ conversationId: "c1", content: "Project Atlas is important.", at: "2026-01-01T00:00:00.000Z" });
  const target = center as unknown as { runDreamStage: (...args: unknown[]) => Promise<unknown> };
  const original = target.runDreamStage.bind(center);
  target.runDreamStage = async (...args: unknown[]) => {
    if (args[2] === "rem") throw new Error("simulated Dream failure");
    return original(...args);
  };
  const run = await center.runDream();
  assert.equal(run.status, "partial");
  assert.equal((await center.listMemories()).length, 1, "A failed stage must not erase existing memory");
  assert.equal((await center.state()).dreams.at(-1)?.entries.at(-1)?.status, "failed");
});

test("profile store lock prevents concurrent transactions from losing data", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "hermes-memory-center-lock-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, "memory-center.json");
  const first = new JsonMemoryStore(path);
  const second = new JsonMemoryStore(path);
  await Promise.all([
    first.transaction((state) => { state.audit.push({ id: "first", at: "2026-01-01T00:00:00.000Z", action: "test", actor: "system", detail: "first" }); }),
    second.transaction((state) => { state.audit.push({ id: "second", at: "2026-01-01T00:00:00.000Z", action: "test", actor: "system", detail: "second" }); }),
  ]);
  assert.deepEqual((await first.read()).audit.map((event) => event.id).sort(), ["first", "second"]);
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
  const home = await requestLocal(`http://127.0.0.1:${port}/`);
  assert.equal(home.status, 200);
  assert.match(home.body, /Hermes B1ack Dream/);
  const capture = await requestLocal(`http://127.0.0.1:${port}/api/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId: "web-1", content: "User preference concise answers." }),
  });
  assert.equal(capture.status, 201);
  const dashboard = await requestLocal(`http://127.0.0.1:${port}/api/dashboard`);
  assert.equal((JSON.parse(dashboard.body) as { recent: number }).recent, 1);
  const state = await requestLocal(`http://127.0.0.1:${port}/api/state`);
  const memoryId = ((JSON.parse(state.body) as { memories: Array<{ id: string }> }).memories[0]?.id)!;
  const detail = await requestLocal(`http://127.0.0.1:${port}/api/memories/${encodeURIComponent(memoryId)}/detail`);
  assert.equal(detail.status, 200);
  assert.equal((JSON.parse(detail.body) as { memory: { id: string } }).memory.id, memoryId);
});

test("Dashboard engine API stays available when the standalone fallback is disabled", async (t) => {
  const { folder, center } = await setup();
  t.after(() => rm(folder, { recursive: true, force: true }));
  const server = createMemoryCenterServer(center, { standaloneUi: false });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/`)).status, 404);
  assert.equal((await fetch(`${base}/api/ping`)).status, 200);
});
