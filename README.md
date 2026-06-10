# pi-script-tools

![pi-script-tools](https://i.postimg.cc/tgBJFPYh/pi-script-tools.jpg)

Auto-discovers `.sh` scripts and registers them as Pi tools, so the LLM can call them alongside built-in tools like `read`, `write`, and `bash`.

## How It Works

At each session start, the extension scans two directories for `.sh` files:

| Scope | Path |
|-------|------|
| **Global** | `~/.pi/agent/scripts/*.sh` |
| **Project-local** | `./.pi/scripts/*.sh` |

Each script is parsed for metadata in its comment header, then registered as a Pi tool via `pi.registerTool()`. Project-local scripts override global scripts if they share the same tool name.

### Metadata Comments

Scripts declare their metadata with comment headers at the top:

```bash
#!/bin/bash
# Name: gather_logs
# Description: Retrieves recent system logs from journalctl or syslog fallback
# Usage: gather_logs [entry_count]
# Timeout: 60000

entry_count="${1:-20}"
journalctl -n "$entry_count" --no-pager 2>/dev/null || tail -n "$entry_count" /var/log/syslog
```

| Comment | Purpose | Default if omitted |
|---------|---------|-------------------|
| `# Name: <name>` | Tool name base (`<name>_sh`) | Filename, hyphens → underscores, `_sh` appended |
| `# Description: <text>` | Shown to the LLM | `(no description)` |
| `# Usage: <text>` | Appended to description | Omitted |
| `# Timeout: <ms>` | Max execution time | `30000` (30s) |

The `# Name:` value must match `^[a-z0-9_]+$` or the filename is used as fallback.

### Tool Parameters

Every registered tool accepts a single optional parameter:

```json
{ "args": "value1 value2" }
```

Space-separated values are passed to the script as `$1`, `$2`, etc. Scripts are executed via `execFile("bash", [scriptPath, ...args], { cwd, timeout })` — no shell is spawned, so arguments cannot contain shell metacharacters.

## Getting Started

### 1. Install the extension

Place this directory (or a clone) under your Pi extensions folder:

```
~/.pi/agent/extensions/pi-script-tools/
```

Restart Pi to load the extension.

### 2. Create your scripts

Drop `.sh` files into either directory:

**Global** (available in every project):
```bash
mkdir -p ~/.pi/agent/scripts
```

**Project-local** (overrides global, scoped to a project):
```bash
mkdir -p ./.pi/scripts
```

### 3. Write a script

Example — `~/.pi/agent/scripts/check-disk.sh`:

```bash
#!/bin/bash
# Name: check_disk
# Description: Reports disk usage for the current project directory
# Usage: check_disk [path]
# Timeout: 15000

target="${1:-.}"
du -sh "$target" 2>/dev/null || echo "Could not read disk usage for $target"
```

This registers as the tool `check_disk_sh`. The LLM can call it with:

```json
{ "args": "/home/user/my-project" }
```

### 4. Use in a persona

Script tools appear in `pi.getAllTools()` automatically, so they show up in the persona wizard's tool selector alongside built-in tools. Select which script tools a persona is allowed to use during creation or editing.

## Lifecycle

- **`session_start`** — Scripts are discovered and tools are registered
- **`/reload`** — Pi reloads the extension, re-scans directories, re-registers tools
- **`session_shutdown`** — No cleanup needed; tools are unregistered when the extension tears down

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing script directory | Silently skipped |
| Unreadable `.sh` file | Skipped |
| Invalid `# Name:` | Falls back to filename-derived name |
| Invalid `# Timeout:` | Uses default `30000`ms |
| Script exits with non-zero code | Returns stderr as the tool result |

## Project Structure

```
pi-script-tools/
├── index.ts              # Extension entry point
├── metadata.ts           # Comment-header parsing
├── discovery.ts          # Directory scanning & merge logic
├── scripts/              # Example scripts
│   └── gather-logs.sh
├── test/                 # Test suite (30 tests)
│   ├── metadata.test.ts
│   ├── discovery.test.ts
│   └── index.test.ts
├── package.json
├── tsconfig.json
└── jest.config.js
```

## Running Tests

```bash
npm install
npm test
```
