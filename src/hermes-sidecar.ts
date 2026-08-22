/**
 * Long-lived stdio bridge owned by the official Python MemoryProvider.
 * Stdout is reserved for line-delimited JSON-RPC; do not log here.
 */
import { createInterface } from "node:readline";
import { createMemoryCenter } from "./memory-center.js";
import { FileNativeMemoryAdapter } from "./native-memory.js";
import { createMemoryCenterServer, listen } from "./server.js";
import { defaultDataPath, JsonMemoryStore } from "./store.js";

type Request = { id?: string; method?: string; params?: Record<string, unknown> };
type Args = { dataDir: string; host: string; port: number; webUi: boolean; standaloneUi: boolean; userPath?: string; memoryPath?: string };

const parseArgs = (): Args => {
  const values = process.argv.slice(2);
  const valueFor = (name: string): string | undefined => values.at(values.indexOf(name) + 1);
  const dataDir = valueFor("--data-dir");
  if (!dataDir) throw new Error("--data-dir is required");
  const port = Number(valueFor("--port") ?? "0");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port must be an integer from 0 to 65535");
  return { dataDir, host: valueFor("--host") ?? "127.0.0.1", port, webUi: valueFor("--web-ui") !== "false", standaloneUi: valueFor("--standalone-ui") !== "false", userPath: valueFor("--user-path"), memoryPath: valueFor("--memory-path") };
};

const reply = (id: string | undefined, result?: unknown, error?: unknown): void => {
  process.stdout.write(`${JSON.stringify(error ? { id, ok: false, error: error instanceof Error ? error.message : String(error) } : { id, ok: true, result })}\n`);
};

const options = parseArgs();
const native = new FileNativeMemoryAdapter({ userPath: options.userPath, memoryPath: options.memoryPath });
const center = createMemoryCenter(new JsonMemoryStore(defaultDataPath(options.dataDir)), native);
const webServer = options.webUi ? createMemoryCenterServer(center, { standaloneUi: options.standaloneUi }) : undefined;
let webPort: number | undefined;
if (webServer) {
  await listen(webServer, options.port, options.host);
  const address = webServer.address();
  if (!address || typeof address === "string") throw new Error("WebUI server has no TCP address");
  webPort = address.port;
}
reply("ready", { dataDir: options.dataDir, webUi: webServer ? { host: options.host, port: webPort } : null });

const run = async (request: Request): Promise<unknown> => {
  const params = request.params ?? {};
  switch (request.method) {
    case "ping": return { ok: true };
    case "settings": {
      const memoryStyle = params.memoryStyle;
      const automaticDream = params.automaticDream;
      await center.updateSettings({
        ...(memoryStyle === "conservative" || memoryStyle === "balanced" || memoryStyle === "active" ? { memoryStyle } : {}),
        ...(typeof automaticDream === "boolean" ? { automaticDream } : {}),
      });
      return { updated: true };
    }
    case "capture_turn": {
      const userContent = String(params.userContent ?? "");
      const assistantContent = String(params.assistantContent ?? "");
      if (!userContent || !assistantContent) throw new Error("Completed turn requires userContent and assistantContent.");
      const traces = await center.captureCompletedTurn({
        conversationId: String(params.sessionId ?? ""), userContent, assistantContent,
        sourceId: String(params.sourceId ?? ""), title: typeof params.title === "string" ? params.title : undefined,
        messages: Array.isArray(params.messages) ? params.messages as Array<{ role?: string; content?: unknown }> : undefined,
      });
      return { traceCount: traces.length };
    }
    case "recall": {
      const result = await center.recall(String(params.sessionId ?? ""), String(params.query ?? ""), typeof params.limit === "number" ? params.limit : undefined);
      // Hermes injects a non-empty prefetch return. This is the strongest fact
      // available; it does not pretend to know whether the model read it.
      await center.markRecallOutcome(result.memories.map((memory) => memory.recordId), result.context ? "injected" : "not_injected");
      return { context: result.context, count: result.memories.length, recordIds: result.memories.map((memory) => memory.recordId) };
    }
    case "dream": {
      const trigger = String(params.trigger ?? "manual");
      if (!["manual", "session_end", "scheduled", "startup_catchup"].includes(trigger)) throw new Error("Dream trigger is invalid.");
      return center.runDream(trigger as "manual" | "session_end" | "scheduled" | "startup_catchup");
    }
    case "status": return center.dashboard();
    case "flush": return { flushed: true };
    case "shutdown": {
      if (webServer) await new Promise<void>((resolve, reject) => webServer.close((error) => error ? reject(error) : resolve()));
      return { stopped: true };
    }
    default: throw new Error(`Unsupported runtime method: ${request.method ?? ""}`);
  }
};

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  let request: Request | undefined;
  try {
    request = JSON.parse(line) as Request;
    const result = await run(request);
    reply(request.id, result);
    if (request.method === "shutdown") process.exit(0);
  } catch (error) {
    reply(request?.id, undefined, error);
  }
}
