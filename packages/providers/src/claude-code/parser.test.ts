import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseClaudeLine } from "./parser.js";

const fixture = new URL("../../test-fixtures/read-file.jsonl", import.meta.url);
const events = readFileSync(fixture, "utf8").split("\n").filter(Boolean).flatMap(parseClaudeLine);

test("normalizes a real tool-using run", () => {
  assert.deepEqual(
    events.map((e) => e.type),
    ["session.started", "tool.call", "tool.result", "message", "run.finished"],
  );
});

test("extracts tool call, result and final summary", () => {
  const call = events.find((e) => e.type === "tool.call");
  const result = events.find((e) => e.type === "tool.result");
  const done = events.find((e) => e.type === "run.finished");
  assert.equal(call?.type === "tool.call" && call.name, "Read");
  assert.equal(result?.type === "tool.result" && result.callId, call?.type === "tool.call" && call.callId);
  assert.equal(done?.type === "run.finished" && done.ok, true);
});

test("ignores garbage and unknown lines", () => {
  assert.deepEqual(parseClaudeLine("not json"), []);
  assert.deepEqual(parseClaudeLine('{"type":"rate_limit_event"}'), []);
});

const permission = (name: string) =>
  readFileSync(new URL(`../../test-fixtures/${name}`, import.meta.url), "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap(parseClaudeLine);

test("real can_use_tool request becomes permission.requested, linked to the tool call", () => {
  const events = permission("permission-allow.jsonl");
  const request = events.find((e) => e.type === "permission.requested");
  const call = events.find((e) => e.type === "tool.call");
  assert.ok(request?.type === "permission.requested" && call?.type === "tool.call");
  assert.equal(request.tool, "Bash");
  assert.equal(request.requestId, "e14df67f-36ec-4153-b1c8-b8afdabd5b89");
  assert.equal(request.callId, call.callId);
  assert.equal(request.description, "Create directory and echo ok");
  assert.deepEqual(request.input, { command: "mkdir made-by-claude && echo ok", description: "Create directory and echo ok" });
});

test("a denied action shows up as an error tool.result", () => {
  const result = permission("permission-deny.jsonl").find((e) => e.type === "tool.result");
  assert.ok(result?.type === "tool.result");
  assert.equal(result.isError, true);
  assert.equal(result.output, "Denied by Merge user");
});

test("ignores control requests that are not permission requests", () => {
  assert.deepEqual(parseClaudeLine('{"type":"control_request","request_id":"x","request":{"subtype":"interrupt"}}'), []);
});
