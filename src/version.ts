import { readFileSync } from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./config.js";

const pkg = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")) as { name: string; version: string };

/** The package version and npm name, read from package.json so there is one place to change them. */
export const VERSION: string = pkg.version;
export const PACKAGE_NAME: string = pkg.name;
