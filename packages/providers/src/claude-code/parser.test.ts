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
