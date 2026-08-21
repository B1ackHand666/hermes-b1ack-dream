import { join } from "node:path";
import { createMemoryCenter } from "./memory-center.js";
import { FileNativeMemoryAdapter } from "./native-memory.js";
import { createMemoryCenterServer, listen } from "./server.js";
import { defaultDataPath, JsonMemoryStore } from "./store.js";

const dataDirectory = process.env.MEMORY_CENTER_DATA_DIR ?? join(process.cwd(), ".memory-center");
const port = Number(process.env.PORT ?? 4317);
const nativeAdapter = new FileNativeMemoryAdapter({
  userPath: process.env.HERMES_USER_MEMORY_PATH,
  memoryPath: process.env.HERMES_LONG_TERM_MEMORY_PATH,
});
const center = createMemoryCenter(new JsonMemoryStore(defaultDataPath(dataDirectory)), nativeAdapter);
const server = createMemoryCenterServer(center);

await listen(server, port);
console.log(`Hermes B1ack Dream is available at http://127.0.0.1:${port}`);
console.log(`Data directory: ${dataDirectory}`);
if (!nativeAdapter.available) console.log("Hermes native-memory editor is disabled until both verified explicit paths are configured.");
