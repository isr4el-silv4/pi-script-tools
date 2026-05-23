import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, Static } from "@sinclair/typebox";
import { execFile } from "node:child_process";
import { discoverScripts, type ScriptEntry } from "./discovery";

const ParamsSchema = Type.Object({
  args: Type.Optional(Type.String({ description: "Space-separated arguments passed to the script as $1, $2, etc." })),
});
type Params = Static<typeof ParamsSchema>;

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
    ): Promise<{ content: string }> => {
      const args = params.args ? params.args.split(" ") : [];
      const childCwd = (ctx as ExtensionContext & { cwd?: string }).cwd || process.cwd();

      const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
        (resolve) => {
          const child = execFile(
            "bash",
            [entry.path, ...args],
            {
              cwd: childCwd,
              timeout: entry.timeout,
              maxBuffer: 10 * 1024 * 1024, // 10MB
              signal,
            },
            (error, stdout, stderr) => {
              if (error) {
                resolve({
                  stdout: stdout || "",
                  stderr: stderr || error.message,
                  code: typeof error.code === "number" ? error.code : null,
                });
              } else {
                resolve({ stdout: stdout || "", stderr: stderr || "", code: 0 });
              }
            },
          );
        },
      );

      if (result.code === 0) {
        return { content: result.stdout };
      }

      return {
        content: `Script exited with code ${result.code}.\n${result.stderr || result.stdout}`,
      };
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
