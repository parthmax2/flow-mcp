import { readFileSync } from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./config.js";

/** The package version, read from package.json so there is one place to bump it. */
export const VERSION: string = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")).version;
