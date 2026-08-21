import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NativeMemoryAdapter } from "./memory-center.js";

export interface FileNativeMemoryOptions {
  userPath?: string;
  memoryPath?: string;
}

/**
 * Explicit file adapter for a verified Hermes installation. The formal Hermes
 * adapter supplies its verified profile paths; this class never discovers,
 * synchronizes, or modifies a path on its own. MemoryCenter calls it only after
 * a confirmed native-memory UI action.
 */
export class FileNativeMemoryAdapter implements NativeMemoryAdapter {
  readonly available: boolean;
  readonly limitation?: string;

  constructor(private readonly options: FileNativeMemoryOptions) {
    this.available = Boolean(options.userPath && options.memoryPath);
    this.limitation = this.available
      ? "File paths are explicit configuration only. Verify Hermes read/write behavior before enabling them."
      : "The Hermes native-memory editor is disabled for this profile.";
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
