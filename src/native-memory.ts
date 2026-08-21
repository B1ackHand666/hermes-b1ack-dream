import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NativeMemoryAdapter } from "./memory-center.js";

export interface FileNativeMemoryOptions {
  userPath?: string;
  memoryPath?: string;
}

/**
 * Explicit file adapter for a verified Hermes installation. Paths are supplied by
 * configuration; this class never discovers, synchronizes, or modifies a path on
 * its own. MemoryCenter only calls it after a confirmed native-memory UI action.
 */
export class FileNativeMemoryAdapter implements NativeMemoryAdapter {
  readonly available: boolean;
  readonly limitation?: string;

  constructor(private readonly options: FileNativeMemoryOptions) {
    this.available = Boolean(options.userPath && options.memoryPath);
    this.limitation = this.available
      ? "File paths are explicit configuration only. Verify Hermes read/write behavior before enabling them."
      : "Set both HERMES_USER_MEMORY_PATH and HERMES_LONG_TERM_MEMORY_PATH only after verifying a Hermes installation.";
  }

  async read(target: "user" | "memory"): Promise<string> {
    const file = this.fileFor(target);
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }

  async write(target: "user" | "memory", content: string): Promise<void> {
    const file = this.fileFor(target);
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.memory-center.tmp`;
    await writeFile(temp, content, "utf8");
    await rename(temp, file);
  }

  private fileFor(target: "user" | "memory"): string {
    const file = target === "user" ? this.options.userPath : this.options.memoryPath;
    if (!file) throw new Error(`No explicit Hermes ${target === "user" ? "USER.md" : "MEMORY.md"} path is configured.`);
    return file;
  }
}
