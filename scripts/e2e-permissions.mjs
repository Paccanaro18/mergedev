// Manual end-to-end check of interactive permissions: real Claude Code -> Runner -> SQLite.
// Runs a command that is NOT auto-allowed three times: allow, deny, and cancel while waiting.
// Usage: node scripts/e2e-permissions.mjs [projectDir]
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeProvider } from "@merge/providers";
import { Runner } from "@merge/runner";
import { SqliteStore } from "@merge/store";

const projectDir = process.argv[2] ?? mkdtempSync(join(tmpdir(), "merge-perm-"));
const store = new SqliteStore(":memory:");
const project = store.createProject({ name: "e2e", path: projectDir });
const runner = new Runner(store, [new ClaudeCodeProvider()]);
const prompt = "Use the Bash tool to run exactly: npm --version . Then reply with its output only.";

async function scenario(name, decide, { cancelWhilePending = false } = {}) {
  const task = store.createTask({ projectId: project.id, title: name, prompt });
  const ctrl = new AbortController();
  const t0 = Date.now();
  const run = await runner.runTask(task.id, {
    providerId: "claude-code",
    signal: ctrl.signal,
    onPermissionRequest: async (req) => {
      console.log(`  [${name}] asked: ${req.tool} ${JSON.stringify(req.input)}`);
      if (cancelWhilePending) {
        setTimeout(() => ctrl.abort(), 300);
        return new Promise(() => {}); // never answers: the UI is "still open"
      }
      return decide;
    },
  });
  const events = store.listEvents(run.id);
  const result = events.find((e) => e.type === "tool.result");
  console.log(`  [${name}] run=${run.status} in ${Date.now() - t0}ms`);
  console.log(`  [${name}] events: ${events.map((e) => e.type).join(", ")}`);
  console.log(`  [${name}] tool.result: ${result ? JSON.stringify(result.output).slice(0, 80) : "(none)"}`);
}

await scenario("allow", { decision: "allow" });
await scenario("deny", { decision: "deny", reason: "Not allowed by the user" });
await scenario("cancel-while-pending", null, { cancelWhilePending: true });
store.close();
