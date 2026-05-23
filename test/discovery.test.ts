import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { discoverScripts } from "../discovery";

// Helper to create temp directories with scripts
function createTempDir(files: Record<string, string>): string {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-script-tools-test-"));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tmpdir, name), content);
  }
  return tmpdir;
}

describe("discoverScripts", () => {
  let originalHome: string;

  beforeEach(() => {
    originalHome = os.homedir();
  });

  afterEach(() => {
    // Restore original homedir behavior
    jest.restoreAllMocks();
  });

  it("returns empty map when no script directories exist", () => {
    // Use a fake home dir with no scripts
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const result = discoverScripts("/tmp/fake-project");
    expect(result.size).toBe(0);
  });

  it("discovers global scripts", () => {
    const fakeHome = createTempDir({});
    const scriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "hello.sh"),
      '#!/bin/bash\n# Name: hello\n# Description: Says hello\necho hello'
    );

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const result = discoverScripts("/tmp/fake-project");
    expect(result.size).toBe(1);
    expect(result.has("hello_sh")).toBe(true);
  });

  it("discovers project-local scripts", () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    // Create project-local scripts dir
    const projectDir = createTempDir({});
    const localScriptsDir = path.join(projectDir, ".pi", "scripts");
    fs.mkdirSync(localScriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(localScriptsDir, "local-tool.sh"),
      '#!/bin/bash\n# Name: local_tool\n# Description: A local tool\necho local'
    );

    const result = discoverScripts(projectDir);
    expect(result.size).toBe(1);
    expect(result.has("local_tool_sh")).toBe(true);
  });

  it("local scripts override global scripts on name collision", () => {
    const fakeHome = createTempDir({});
    const globalScriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(globalScriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalScriptsDir, "deploy.sh"),
      '#!/bin/bash\n# Name: deploy\n# Description: Global deploy\necho global'
    );

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    // Create project-local scripts with same tool name
    const projectDir = createTempDir({});
    const localScriptsDir = path.join(projectDir, ".pi", "scripts");
    fs.mkdirSync(localScriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(localScriptsDir, "deploy.sh"),
      '#!/bin/bash\n# Name: deploy\n# Description: Local deploy\necho local'
    );

    const result = discoverScripts(projectDir);
    expect(result.size).toBe(1);
    expect(result.has("deploy_sh")).toBe(true);
    // The local one should win
    expect(result.get("deploy_sh")!.path).toContain(projectDir);
  });

  it("skips non-.sh files", () => {
    const fakeHome = createTempDir({});
    const scriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "hello.sh"), '#!/bin/bash\necho hi');
    fs.writeFileSync(path.join(scriptsDir, "readme.md"), '# Not a script');
    fs.writeFileSync(path.join(scriptsDir, "helper.py"), '# Not a script');

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const result = discoverScripts("/tmp/fake-project");
    expect(result.size).toBe(1);
  });

  it("derives tool name from filename when no # Name comment", () => {
    const fakeHome = createTempDir({});
    const scriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "my-cool-script.sh"),
      '#!/bin/bash\n# Description: No name comment\necho hi'
    );

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const result = discoverScripts("/tmp/fake-project");
    expect(result.size).toBe(1);
    expect(result.has("my_cool_script_sh")).toBe(true);
  });

  it("uses # Name comment for tool name when valid", () => {
    const fakeHome = createTempDir({});
    const scriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "any-filename.sh"),
      '#!/bin/bash\n# Name: my_custom_name\n# Description: Custom name\necho hi'
    );

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const result = discoverScripts("/tmp/fake-project");
    expect(result.size).toBe(1);
    expect(result.has("my_custom_name_sh")).toBe(true);
  });

  it("falls back to filename when # Name is invalid", () => {
    const fakeHome = createTempDir({});
    const scriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "valid-name.sh"),
      '#!/bin/bash\n# Name: Invalid Name!\n# Description: Bad name\necho hi'
    );

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const result = discoverScripts("/tmp/fake-project");
    expect(result.size).toBe(1);
    expect(result.has("valid_name_sh")).toBe(true);
  });

  it("includes metadata in discovered entries", () => {
    const fakeHome = createTempDir({});
    const scriptsDir = path.join(fakeHome, ".pi", "agent", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "test.sh"),
      '#!/bin/bash\n# Name: test\n# Description: Test script\n# Usage: test [args]\n# Timeout: 45000\necho hi'
    );

    jest.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const result = discoverScripts("/tmp/fake-project");
    const entry = result.get("test_sh");
    expect(entry).toBeDefined();
    expect(entry!.description).toBe("Test script");
    expect(entry!.usage).toBe("test [args]");
    expect(entry!.timeout).toBe(45000);
  });
});
