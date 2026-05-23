import { parseScriptMetadata, deriveToolName } from "../metadata";

describe("parseScriptMetadata", () => {
  it("parses all four metadata comments", () => {
    const content = `#!/bin/bash
# Name: gather_logs
# Description: Retrieves recent system logs
# Usage: gather_logs [entry_count]
# Timeout: 60000

echo "hello"`;

    const result = parseScriptMetadata(content);
    expect(result.name).toBe("gather_logs");
    expect(result.description).toBe("Retrieves recent system logs");
    expect(result.usage).toBe("gather_logs [entry_count]");
    expect(result.timeout).toBe(60000);
  });

  it("returns defaults when no metadata comments present", () => {
    const content = `#!/bin/bash
echo "hello"`;

    const result = parseScriptMetadata(content);
    expect(result.name).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.usage).toBeUndefined();
    expect(result.timeout).toBe(30000);
  });

  it("partially parses when some metadata is missing", () => {
    const content = `#!/bin/bash
# Name: my_tool
# Description: Does something

echo "hi"`;

    const result = parseScriptMetadata(content);
    expect(result.name).toBe("my_tool");
    expect(result.description).toBe("Does something");
    expect(result.usage).toBeUndefined();
    expect(result.timeout).toBe(30000);
  });

  it("ignores metadata-like text in non-comment lines", () => {
    const content = `#!/bin/bash
# Name: real_name
echo "# Name: fake_name"

echo "hi"`;

    const result = parseScriptMetadata(content);
    expect(result.name).toBe("real_name");
  });

  it("handles empty content", () => {
    const result = parseScriptMetadata("");
    expect(result.name).toBeUndefined();
    expect(result.timeout).toBe(30000);
  });

  it("handles whitespace-only metadata value", () => {
    const content = `#!/bin/bash
# Name:   
# Description:   

echo "hi"`;

    const result = parseScriptMetadata(content);
    // Whitespace-only values should be treated as absent
    expect(result.name).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it("ignores invalid timeout (non-numeric)", () => {
    const content = `#!/bin/bash
# Timeout: not_a_number

echo "hi"`;

    const result = parseScriptMetadata(content);
    expect(result.timeout).toBe(30000);
  });

  it("handles negative timeout as invalid", () => {
    const content = `#!/bin/bash
# Timeout: -5

echo "hi"`;

    const result = parseScriptMetadata(content);
    expect(result.timeout).toBe(30000);
  });
});

describe("deriveToolName", () => {
  it("derives name from simple filename", () => {
    expect(deriveToolName("gather_logs.sh")).toBe("gather_logs_sh");
  });

  it("replaces hyphens with underscores", () => {
    expect(deriveToolName("gather-logs.sh")).toBe("gather_logs_sh");
  });

  it("handles multiple hyphens", () => {
    expect(deriveToolName("my-cool-script.sh")).toBe("my_cool_script_sh");
  });

  it("strips .sh extension before appending _sh", () => {
    expect(deriveToolName("test.sh")).toBe("test_sh");
  });

  it("handles filename without extension", () => {
    expect(deriveToolName("test")).toBe("test_sh");
  });

  it("appends _sh suffix", () => {
    expect(deriveToolName("hello.sh")).toBe("hello_sh");
  });
});
