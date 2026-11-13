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

test("interactive runs read stream-json from stdin and delegate permission prompts", () => {
  const args = buildClaudeArgs({}, { interactive: true });
  assert.deepEqual(args.slice(0, 5), ["-p", "--input-format", "stream-json", "--permission-prompt-tool", "stdio"]);
  assert.equal(args[args.indexOf("--permission-mode") + 1], "acceptEdits");
  assert.equal(buildClaudeArgs({}).includes("--permission-prompt-tool"), false);
});

test("resumes a previous session with --resume", () => {
  const args = buildClaudeArgs({}, { resumeSessionId: "abc-123" });
  assert.equal(args[args.indexOf("--resume") + 1], "abc-123");
  assert.equal(buildClaudeArgs({}).includes("--resume"), false);
});
