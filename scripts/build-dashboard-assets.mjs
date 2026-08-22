import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src/dashboard/style.css");
const destination = resolve(root, "plugins/hermes/dashboard/dist/style.css");

mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination);
