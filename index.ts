import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, Static } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import { discoverScripts, type ScriptEntry } from "./discovery";

const ParamsSchema = Type.Object({
  args: Type.Optional(Type.String({ description: "Space-separated arguments passed to the script as $1, $2, etc." })),
});
type Params = Static<typeof ParamsSchema>;

type ToolResult = { content: Array<{ type: "text"; text: string }> };

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/**
 * Split a string into shell-like arguments, respecting single quotes,
 * double quotes, and backslash escapes.
 *
 * Examples:
 *   `hello world`           → ["hello", "world"]
 *   `"hello world" foo`     → ["hello world", "foo"]
 *   `'hello world' foo`     → ["hello world", "foo"]
 *   `hello\\ world`          → ["hello world"]
 */
function shellSplit(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (i < input.length) {
    const ch = input[i];

    if (inSingleQuote) {
      if (ch === "'") {
        inSingleQuote = false;
      } else {
        current += ch;
      }
    } else if (inDoubleQuote) {
      if (ch === "\\" && i + 1 < input.length) {
        const next = input[i + 1];
        if (next === '"' || next === "\\" || next === '$' || next === '`') {
          current += next;
          i += 2;
          continue;
        }
      }
      if (ch === '"') {
        inDoubleQuote = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === "\\" && i + 1 < input.length) {
        current += input[i + 1];
        i += 2;
        continue;
      } else if (ch === "'") {
        inSingleQuote = true;
      } else if (ch === '"') {
        inDoubleQuote = true;
      } else if (ch === " " || ch === "\t") {
        if (current) {
          args.push(current);
          current = "";
        }
      } else {
        current += ch;
      }
    }
    i++;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Build the tool description from metadata.
 */
function buildDescription(entry: ScriptEntry): string {
  let desc = entry.description || "(no description)";
  if (entry.usage) {
    desc += `\nUsage: ${entry.usage}`;
  }
  return desc;
}

/**
 * Register a single script as a Pi tool.
 */
function registerScriptTool(pi: ExtensionAPI, toolName: string, entry: ScriptEntry): void {
  pi.registerTool({
    name: toolName,
    label: toolName,
    description: buildDescription(entry),
    parameters: ParamsSchema,
    execute: async (
      _toolCallId: string,
      params: Params,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<ToolResult> => {
      const args = params.args ? shellSplit(params.args) : [];
      const childCwd = (ctx as ExtensionContext & { cwd?: string }).cwd || process.cwd();

      const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
        (resolve) => {
          const spawnOpts: { cwd: string; timeout: number; maxBuffer: number; signal?: AbortSignal } = {
            cwd: childCwd,
            timeout: entry.timeout,
            maxBuffer: 10 * 1024 * 1024, // 10MB
          };
          if (signal instanceof AbortSignal) {
            spawnOpts.signal = signal;
          }
          const child = spawn("bash", [entry.path, ...args], spawnOpts);
          // Pipe first argument to stdin so scripts can read multi-line JSON
          if (args.length > 0) {
            child.stdin.write(args[0]);
          }
          child.stdin.end();
          const stdoutParts: Buffer[] = [];
          const stderrParts: Buffer[] = [];
          child.stdout.on("data", (d: Buffer) => stdoutParts.push(d));
          child.stderr.on("data", (d: Buffer) => stderrParts.push(d));
          child.on("close", (code) => {
            resolve({
              stdout: Buffer.concat(stdoutParts).toString("utf-8"),
              stderr: Buffer.concat(stderrParts).toString("utf-8"),
              code,
            });
          });
          child.on("error", (err) => {
            resolve({
              stdout: Buffer.concat(stdoutParts).toString("utf-8"),
              stderr: err.message,
              code: null,
            });
          });
        },
      );

      if (result.code === 0) {
        return textResult(result.stdout);
      }

      return textResult(`Script exited with code ${result.code}.\n${result.stderr || result.stdout}`);
    },
  });
}

/**
 * pi-script-tools extension entry point.
 *
 * Auto-discovers `.sh` scripts from global and project-local directories,
 * parses their metadata, and registers them as Pi tools.
 */
export default function (pi: ExtensionAPI): void {
  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    const cwd = (ctx as ExtensionContext & { cwd?: string }).cwd || process.cwd();
    const scripts = discoverScripts(cwd);

    for (const [toolName, entry] of scripts) {
      registerScriptTool(pi, toolName, entry);
    }
  });
}
