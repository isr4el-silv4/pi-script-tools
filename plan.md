# pi-script-tools — Implementation Plan

## Goal

Auto-discover `.sh` scripts from global and project-local directories, register them as Pi tools via `pi.registerTool()`, and make them available for selection in the persona wizard and for direct LLM use.

---

## Directory Structure

```
~/.pi/agent/extensions/
└── pi-script-tools/
    ├── index.ts          # Extension entry point
    ├── plan.md           # This file
    └── scripts/          # (optional) example scripts for reference
```

### Script Discovery Paths

| Scope | Path |
|-------|------|
| Global | `~/.pi/agent/scripts/*.sh` |
| Project-local | `./.pi/scripts/*.sh` |

Both locations are scanned at `session_start`. Project-local scripts override global scripts if they share the same tool name.

---

## Script Metadata Convention

Scripts declare metadata via comment headers at the top of the file:

```bash
#!/bin/bash
# Name: gather_logs
# Description: Retrieves recent system logs from journalctl or syslog fallback
# Usage: gather_logs [entry_count]
# Timeout: 60000

entry_count="${1:-20}"
journalctl -n "$entry_count" --no-pager 2>/dev/null || tail -n "$entry_count" /var/log/syslog
```

### Supported Comments

| Comment | Purpose | Format | Default if omitted |
|---------|---------|--------|-------------------|
| `# Name: <name>` | Base name (tool name becomes `<name>_sh`) | `^[a-z0-9_]+$` | Filename with `-` → `_`, `.sh` stripped, `_sh` appended |
| `# Description: <text>` | Shown to LLM and in persona wizard | Any string | No description shown |
| `# Usage: <text>` | Appended to tool description after Description | Any string | Omitted |
| `# Timeout: <ms>` | Max execution time | Integer, milliseconds | `30000` (30s) |

---

## Tool Registration

Each discovered `.sh` file is registered as a Pi tool via `pi.registerTool()`:

- **Tool name**: From `# Name:` comment + `_sh` suffix, or derived from filename + `_sh` suffix (`gather-logs.sh` → `gather_logs_sh`, hyphens replaced with underscores, `_sh` appended)
- **Description**: From `# Description:` comment, optionally appended with `# Usage:` text
- **Parameters**: `{ args?: string }` — space-separated arguments passed to the script as `$1`, `$2`, etc.
- **Execution**: `child_process.execFile("bash", [scriptPath, ...args.split(" ")], { cwd: ctx.cwd, timeout })`
- **Timeout**: From `# Timeout:` comment, default `30000`

### Why `execFile` over `exec`

`execFile` runs the binary directly without spawning a shell, passing arguments as a clean array. This prevents shell injection — args cannot contain `;`, `|`, `$()`, or other shell metacharacters that would be interpreted.

---

## Extension Behavior

### Lifecycle

1. **`session_start`**: Scan both script directories, parse metadata, register tools
2. **`session_shutdown`**: No cleanup needed (tools are unregistered when extension runtime tears down)
3. **`/reload`**: Pi reloads the extension, re-scans directories, re-registers tools

### Discovery Logic

```
1. Read ~/.pi/agent/scripts/*.sh → global scripts map (name → path)
2. Read ./.pi/scripts/*.sh → local scripts map (name → path)
3. Merge: local overrides global on name collision
4. For each script:
   a. Parse metadata comments
   b. Derive tool name (comment override or filename) → append `_sh` suffix
   c. Register via pi.registerTool()
```

### Error Handling

- Missing directory: Silently skip (no scripts available from that location)
- Unreadable `.sh` file: Log warning, skip that script
- Invalid `# Name:` (doesn't match `^[a-z0-9_]+$`): Fall back to filename-derived name
- Invalid `# Timeout:` (not a number): Use default `30000`
- Script execution failure: Return stderr as tool result with error indicator

---

## Integration with Persona Extension

- Tools registered via `pi.registerTool()` appear in `pi.getAllTools()` automatically
- The persona wizard's tool selector (MultiSelectList) queries `pi.getAllTools()`
- **No changes needed to the persona extension** — script tools appear alongside built-in tools (`read`, `write`, `bash`, etc.) and any other extension-registered tools
- User selects which script tools the persona is allowed to use during creation/edit

---

## File: `index.ts`

### Structure

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Constants
const GLOBAL_SCRIPTS_DIR = path.join(os.homedir(), ".pi", "agent", "scripts");
const LOCAL_SCRIPTS_DIR = path.join(".pi", "scripts");
const DEFAULT_TIMEOUT = 30000;

// Metadata parsing
function parseScriptMetadata(content: string): ScriptMetadata { ... }

// Tool name derivation
function deriveToolName(filename: string): string { ... }

// Script discovery
function discoverScripts(cwd: string): Map<string, ScriptEntry> { ... }

// Tool registration
function registerScriptTool(pi: ExtensionAPI, entry: ScriptEntry): void { ... }

// Main extension
export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    const scripts = discoverScripts(ctx.cwd);
    for (const [name, entry] of scripts) {
      registerScriptTool(pi, entry);
    }
  });
}
```

---

## Definition of Done

- [ ] `index.ts` created with script discovery and tool registration logic
- [ ] Global scripts discovered from `~/.pi/agent/scripts/*.sh`
- [ ] Project-local scripts discovered from `./.pi/scripts/*.sh`
- [ ] Local scripts override global scripts on name collision
- [ ] Metadata parsed from `# Name:`, `# Description:`, `# Usage:`, `# Timeout:` comments
- [ ] Tool names use underscores (hyphens from filenames replaced)
- [ ] Tools registered via `pi.registerTool()` with `args?: string` parameter
- [ ] Scripts executed via `execFile("bash", [path, ...args], { cwd, timeout })`
- [ ] Default timeout 30000ms, overridable via `# Timeout:` comment
- [ ] Tools appear in `pi.getAllTools()` and thus in the persona wizard
- [ ] Missing directories handled gracefully (no errors)
- [ ] Script execution errors returned as tool results (not crashes)
- [ ] Example `.sh` file included in the extension directory for reference
