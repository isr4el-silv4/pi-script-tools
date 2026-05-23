import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extensionFactory from "../index";

describe("extension", () => {
  let originalHome: string;
  let registeredTools: any[];
  let sessionStartHandlers: any[];

  function createMockPi(): ExtensionAPI {
    return {
      on: jest.fn((event: string, handler: any) => {
        if (event === "session_start") {
          sessionStartHandlers.push(handler);
        }
      }),
      registerTool: jest.fn((tool: any) => {
        registeredTools.push(tool);
      }),
    } as unknown as ExtensionAPI;
  }

  beforeEach(() => {
    originalHome = os.homedir();
    registeredTools = [];
    sessionStartHandlers = [];
    jest.restoreAllMocks();
  });

  it("registers session_start handler", () => {
    const pi = createMockPi();
    extensionFactory(pi);

    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(sessionStartHandlers.length).toBe(1);
  });

  it("discovers and registers scripts on session_start", async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
    const scriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "hello.sh"),
      '#!/bin/bash\n# Name: hello\n# Description: Says hello\necho hello'
    );

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const pi = createMockPi();
    extensionFactory(pi);

    // Simulate session_start
    const ctx = { cwd: "/tmp/fake-project" } as ExtensionContext;
    await sessionStartHandlers[0]({ type: "session_start", reason: "startup" }, ctx);

    expect(registeredTools.length).toBe(1);
    expect(registeredTools[0].name).toBe("hello_sh");
    expect(registeredTools[0].description).toBe("Says hello");
  });

  it("registers tool with correct parameter schema", async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
    const scriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "tool.sh"),
      '#!/bin/bash\n# Name: tool\n# Description: A tool\necho hi'
    );

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const pi = createMockPi();
    extensionFactory(pi);

    const ctx = { cwd: "/tmp/fake-project" } as ExtensionContext;
    await sessionStartHandlers[0]({ type: "session_start", reason: "startup" }, ctx);

    expect(registeredTools[0].parameters).toBeDefined();
    // TypeBox Object schema has type = "object" and properties
    const schema = registeredTools[0].parameters;
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("args");
  });

  it("handles missing script directories gracefully", async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
    // No scripts directory created
    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const pi = createMockPi();
    extensionFactory(pi);

    const ctx = { cwd: "/tmp/fake-project" } as ExtensionContext;
    // Should not throw
    await expect(
      sessionStartHandlers[0]({ type: "session_start", reason: "startup" }, ctx)
    ).resolves.not.toThrow();
    expect(registeredTools.length).toBe(0);
  });

  it("includes usage in description when present", async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
    const scriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "tool.sh"),
      '#!/bin/bash\n# Name: tool\n# Description: A tool\n# Usage: tool [args]\necho hi'
    );

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const pi = createMockPi();
    extensionFactory(pi);

    const ctx = { cwd: "/tmp/fake-project" } as ExtensionContext;
    await sessionStartHandlers[0]({ type: "session_start", reason: "startup" }, ctx);

    expect(registeredTools[0].description).toContain("A tool");
    expect(registeredTools[0].description).toContain("tool [args]");
  });

  it("execute handler guards against non-AbortSignal signal", async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
    const scriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "echo-tool.sh"),
      '#!/bin/bash\n# Name: echo_tool\n# Description: Echo test\necho "works"'
    );
    fs.chmodSync(path.join(scriptsDir, "echo-tool.sh"), 0o755);

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const pi = createMockPi();
    extensionFactory(pi);

    const ctx = { cwd: fakeHome } as ExtensionContext;
    await sessionStartHandlers[0]({ type: "session_start", reason: "startup" }, ctx);

    const tool = registeredTools[0];
    // Simulate a string signal (the bug scenario)
    const result = await tool.execute("call-1", { args: "" }, "bad-signal" as unknown as AbortSignal, undefined, ctx);
    expect(result.content).toEqual([{ type: "text", text: "works\n" }]);
  });

  it("local scripts override global scripts", async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
    const globalScriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(globalScriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalScriptsDir, "deploy.sh"),
      '#!/bin/bash\n# Name: deploy\n# Description: Global deploy\necho global'
    );

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
    const localScriptsDir = path.join(projectDir, ".pi", "scripts");
    fs.mkdirSync(localScriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(localScriptsDir, "deploy.sh"),
      '#!/bin/bash\n# Name: deploy\n# Description: Local deploy\necho local'
    );

    const pi = createMockPi();
    extensionFactory(pi);

    const ctx = { cwd: projectDir } as ExtensionContext;
    await sessionStartHandlers[0]({ type: "session_start", reason: "startup" }, ctx);

    expect(registeredTools.length).toBe(1);
    expect(registeredTools[0].description).toBe("Local deploy");
  });
});
