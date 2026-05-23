import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseScriptMetadata, deriveToolName } from "./metadata";

function getGlobalScriptsDir(): string {
  return path.join(os.homedir(), ".pi", "agent", "scripts");
}

export interface ScriptEntry {
  path: string;
  description?: string;
  usage?: string;
  timeout: number;
}

/**
 * Validate that a name from `# Name:` is a valid identifier.
 */
function isValidName(name: string): boolean {
  return /^[a-z0-9_]+$/.test(name);
}

/**
 * Read and parse all `.sh` files from a directory.
 * Returns a map of toolName → ScriptEntry.
 * Returns empty map if directory doesn't exist or is unreadable.
 */
function readScriptsDir(dir: string): Map<string, ScriptEntry> {
  const map = new Map<string, ScriptEntry>();

  if (!fs.existsSync(dir)) {
    return map;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return map;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sh")) {
      continue;
    }

    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      // Skip unreadable files
      continue;
    }

    const metadata = parseScriptMetadata(content);

    // Determine tool name
    let toolName: string;
    if (metadata.name && isValidName(metadata.name)) {
      toolName = metadata.name + "_sh";
    } else {
      toolName = deriveToolName(entry.name);
    }

    map.set(toolName, {
      path: filePath,
      description: metadata.description,
      usage: metadata.usage,
      timeout: metadata.timeout,
    });
  }

  return map;
}

/**
 * Discover scripts from both global and project-local directories.
 * Project-local scripts override global scripts on name collision.
 *
 * @param cwd - The project working directory
 * @returns Map of toolName → ScriptEntry
 */
export function discoverScripts(cwd: string): Map<string, ScriptEntry> {
  // 1. Read global scripts
  const globalScripts = readScriptsDir(getGlobalScriptsDir());

  // 2. Read project-local scripts
  const localDir = path.join(cwd, ".pi", "scripts");
  const localScripts = readScriptsDir(localDir);

  // 3. Merge: local overrides global on name collision
  const merged = new Map<string, ScriptEntry>(globalScripts);
  for (const [name, entry] of localScripts) {
    merged.set(name, entry);
  }

  return merged;
}
