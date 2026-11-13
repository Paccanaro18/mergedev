import assert from "node:assert/strict";
import { test } from "node:test";
import { buildClaudeArgs } from "./provider.js";

test("defaults to acceptEdits with no allowed tools", () => {
  assert.deepEqual(buildClaudeArgs({}), [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "acceptEdits",
  ]);
});

test("uses the configured permission mode and allowed tools", () => {
  const args = buildClaudeArgs({ permissionMode: "plan", allowedTools: ["Bash(npm test)", "Read"] });
  assert.equal(args[args.indexOf("--permission-mode") + 1], "plan");
  assert.deepEqual(args.slice(args.indexOf("--allowedTools")), ["--allowedTools", "Bash(npm test)", "Read"]);
});
