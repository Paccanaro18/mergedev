// Manual end-to-end check: real Claude Code -> Runner -> SQLite file.
// Usage: node scripts/e2e.mjs "<prompt>" [projectDir] [dbFile]
import { ClaudeCodeProvider } from "@merge/providers";
import { Runner } from "@merge/runner";
import { SqliteStore } from "@merge/store";

const prompt = process.argv[2] ?? "Reply with exactly the word: pong";
const projectDir = process.argv[3] ?? process.cwd();
const dbFile = process.argv[4] ?? "merge-e2e.db";

const store = new SqliteStore(dbFile);
const project = store.createProject({ name: "e2e", path: projectDir });
const task = store.createTask({ projectId: project.id, title: "e2e", prompt });
const runner = new Runner(store, [new ClaudeCodeProvider()]);

const run = await runner.runTask(task.id, {
  providerId: "claude-code",
  onEvent: (e) => console.log("event:", JSON.stringify(e)),
});

console.log("run:", run.status);
console.log("task:", store.getTask(task.id)?.status);
console.log("persisted events:", store.listEvents(run.id).length);
store.close();
