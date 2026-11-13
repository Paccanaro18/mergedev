import assert from "node:assert/strict";
import { test } from "node:test";
import { permissionResponseLine, userMessageLine } from "./protocol.js";

test("user message is one NDJSON line", () => {
  const line = userMessageLine("fix\nthe bug");
  assert.ok(line.endsWith("\n") && line.indexOf("\n") === line.length - 1);
  assert.deepEqual(JSON.parse(line), { type: "user", message: { role: "user", content: "fix\nthe bug" } });
});

test("allow echoes the original input back (shape captured in docs/permissions-spike.md)", () => {
  const input = { command: "mkdir x" };
  assert.deepEqual(JSON.parse(permissionResponseLine("r1", input, { decision: "allow" })), {
    type: "control_response",
    response: { subtype: "success", request_id: "r1", response: { behavior: "allow", updatedInput: input } },
  });
});

test("deny carries the reason, with a default", () => {
  const msg = (reason?: string) =>
    JSON.parse(permissionResponseLine("r1", {}, { decision: "deny", reason })).response.response;
  assert.deepEqual(msg("too risky"), { behavior: "deny", message: "too risky" });
  assert.deepEqual(msg(), { behavior: "deny", message: "Denied by the user" });
});
