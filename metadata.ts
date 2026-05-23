const DEFAULT_TIMEOUT = 30000;

export interface ScriptMetadata {
  name?: string;
  description?: string;
  usage?: string;
  timeout: number;
}

/**
 * Parse metadata comments from the top of a shell script.
 *
 * Recognized comments:
 * - `# Name: <name>`
 * - `# Description: <text>`
 * - `# Usage: <text>`
 * - `# Timeout: <ms>`
 *
 * Scans lines until the first non-comment, non-blank line after shebang.
 */
export function parseScriptMetadata(content: string): ScriptMetadata {
  const result: ScriptMetadata = { timeout: DEFAULT_TIMEOUT };
  const lines = content.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip shebang
    if (line.startsWith("#!")) continue;

    // Stop at first non-comment, non-empty line
    if (line === "" || line.startsWith("#")) {
      // Continue scanning
    } else {
      break;
    }

    // Parse metadata comments
    if (line.startsWith("# Name: ")) {
      const value = line.slice("# Name: ".length).trim();
      if (value) result.name = value;
    } else if (line.startsWith("# Description: ")) {
      const value = line.slice("# Description: ".length).trim();
      if (value) result.description = value;
    } else if (line.startsWith("# Usage: ")) {
      const value = line.slice("# Usage: ".length).trim();
      if (value) result.usage = value;
    } else if (line.startsWith("# Timeout: ")) {
      const raw = line.slice("# Timeout: ".length).trim();
      const num = parseInt(raw, 10);
      if (!isNaN(num) && num > 0) {
        result.timeout = num;
      }
    }
  }

  return result;
}

/**
 * Derive a tool name from a filename.
 * - Strip `.sh` extension
 * - Replace hyphens with underscores
 * - Append `_sh` suffix
 *
 * Examples:
 * - `gather-logs.sh` → `gather_logs_sh`
 * - `hello.sh` → `hello_sh`
 */
export function deriveToolName(filename: string): string {
  let name = filename;
  if (name.endsWith(".sh")) {
    name = name.slice(0, -3);
  }
  return name.replace(/-/g, "_") + "_sh";
}
