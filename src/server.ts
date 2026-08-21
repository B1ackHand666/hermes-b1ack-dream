import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { webUiHtml } from "./web-ui.js";
import type { MemoryCenter } from "./memory-center.js";

type Json = Record<string, unknown>;

const json = (response: ServerResponse, status: number, value: unknown): void => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
};

const errorMessage = (error: unknown): string => error instanceof Error ? error.message.replace(/[A-Za-z]:\\[^\s]+/g, "[configured path]") : "Unexpected server error.";

const readJson = async (request: IncomingMessage): Promise<Json> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
};

const string = (value: unknown, name: string, required = true): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!required && value === undefined) return undefined;
  throw new Error(`${name} is required.`);
};

const oneOf = <T extends string>(value: unknown, name: string, values: readonly T[]): T => {
  const candidate = string(value, name);
  if (!values.includes(candidate as T)) throw new Error(`${name} is invalid.`);
  return candidate as T;
};

export const createMemoryCenterServer = (center: MemoryCenter): Server => createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const method = request.method ?? "GET";
  const path = url.pathname;
  try {
    if (method === "GET" && path === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(webUiHtml);
      return;
    }
    if (method === "GET" && path === "/api/dashboard") return json(response, 200, await center.dashboard());
    if (method === "GET" && path === "/api/state") return json(response, 200, await center.state());
    if (method === "GET" && path === "/api/export") return json(response, 200, await center.exportData());
    if (method === "GET" && path === "/api/memories") {
      const memoryState = url.searchParams.get("state") ?? undefined;
      if (memoryState && !["recent", "observed", "long_term", "pinned", "archived"].includes(memoryState)) return json(response, 400, { error: "state is invalid." });
      return json(response, 200, await center.listMemories({ state: memoryState as never, query: url.searchParams.get("q") ?? undefined, includeArchived: url.searchParams.get("archived") === "true" }));
    }
    if (method === "GET" && path === "/api/boundaries") return json(response, 200, (await center.state()).boundaries);
    if (method === "GET" && path === "/api/inbox") return json(response, 200, (await center.state()).inbox.filter((item) => item.status === "open"));
    if (method === "GET" && path === "/api/recalls") return json(response, 200, (await center.state()).recalls.slice().reverse());
    if (method === "GET" && path === "/api/dreams") return json(response, 200, (await center.state()).dreams.slice().reverse());
    if (method === "GET" && path === "/api/audit") return json(response, 200, (await center.state()).audit.slice().reverse());
    if (method === "GET" && path === "/api/settings") return json(response, 200, (await center.state()).settings);
    if (method === "GET" && /^\/api\/native\/(user|memory)$/.test(path)) return json(response, 200, await center.nativeMemoryView(path.endsWith("/user") ? "user" : "memory"));
    if (method === "GET" && /^\/api\/memories\/[^/]+$/.test(path)) {
      const memory = await center.getMemory(decodeURIComponent(path.split("/").at(-1)!));
      return memory ? json(response, 200, memory) : json(response, 404, { error: "Memory not found." });
    }

    const body = await readJson(request);
    if (method === "POST" && path === "/api/capture") {
      const traces = await center.capture({ conversationId: string(body.conversationId, "conversationId")!, content: string(body.content, "content")!, title: string(body.title, "title", false), messageId: string(body.messageId, "messageId", false) });
      return json(response, 201, { traces });
    }
    if (method === "POST" && path === "/api/dream") return json(response, 201, await center.runDream());
    if (method === "POST" && path === "/api/recall") return json(response, 200, await center.recall(string(body.conversationId, "conversationId")!, string(body.query, "query")!, typeof body.limit === "number" ? body.limit : undefined));
    if (method === "POST" && path === "/api/boundaries") return json(response, 201, await center.createBoundary(oneOf(body.scope, "scope", ["memory", "topic", "type", "rule"] as const), string(body.value, "value")!, string(body.reason, "reason", false)));
    if (method === "DELETE" && /^\/api\/boundaries\/[^/]+$/.test(path)) {
      await center.removeBoundary(decodeURIComponent(path.split("/").at(-1)!));
      return json(response, 204, {});
    }
    if (method === "PATCH" && path === "/api/settings") return json(response, 200, await center.updateSettings(body));
    if (method === "POST" && /^\/api\/inbox\/[^/]+\/resolve$/.test(path)) {
      await center.resolveInbox(decodeURIComponent(path.split("/")[3]), oneOf(body.action, "action", ["confirm", "continue", "recent", "keep_old", "use_new"] as const));
      return json(response, 204, {});
    }
    if (method === "POST" && path === "/api/copy-to-native") {
      await center.copyMemoryToNative(string(body.memoryId, "memoryId")!, oneOf(body.target, "target", ["user", "memory"] as const), string(body.content, "content")!, body.confirmed === true);
      return json(response, 204, {});
    }
    if (method === "POST" && /^\/api\/native\/(user|memory)$/.test(path)) {
      const target = path.endsWith("/user") ? "user" : "memory";
      await center.writeNativeMemory(target, string(body.content, "content", false) ?? "", { confirmed: body.confirmed === true, action: "write" });
      return json(response, 204, {});
    }
    if (method === "POST" && /^\/api\/native\/(user|memory)\/restore$/.test(path)) {
      const target = path.includes("/user/") ? "user" : "memory";
      await center.restoreNativeMemory(target, string(body.versionId, "versionId")!, body.confirmed === true);
      return json(response, 204, {});
    }
    if (/^\/api\/memories\/[^/]+/.test(path)) {
      const memoryId = decodeURIComponent(path.split("/")[3]);
      if (method === "PATCH" && /^\/api\/memories\/[^/]+$/.test(path)) return json(response, 200, await center.updateMemory(memoryId, { title: string(body.title, "title")!, content: string(body.content, "content")!, type: oneOf(body.type, "type", ["fact", "preference", "goal", "project", "habit", "person", "place", "event", "learning", "collaboration", "other"] as const) }));
      if (method === "DELETE" && /^\/api\/memories\/[^/]+$/.test(path)) return json(response, 200, { deleted: await center.deleteMemory(memoryId, { preventRelearning: body.preventRelearning === true, related: body.related === true }) });
      if (method === "POST" && path.endsWith("/pin")) return json(response, 200, await center.pin(memoryId));
      if (method === "POST" && path.endsWith("/unpin")) return json(response, 200, await center.unpin(memoryId));
      if (method === "POST" && path.endsWith("/archive")) { await center.archive(memoryId); return json(response, 204, {}); }
      if (method === "POST" && path.endsWith("/restore")) { await center.restore(memoryId); return json(response, 204, {}); }
      if (method === "POST" && path.endsWith("/observed")) { await center.decideObserved(memoryId, oneOf(body.action, "action", ["confirm", "continue", "recent", "ignore"] as const)); return json(response, 204, {}); }
    }
    return json(response, 404, { error: "Endpoint not found." });
  } catch (error) {
    return json(response, 400, { error: errorMessage(error) });
  }
});

export const listen = async (server: Server, port: number, host = "127.0.0.1"): Promise<void> => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, host, () => { server.off("error", reject); resolve(); });
});
