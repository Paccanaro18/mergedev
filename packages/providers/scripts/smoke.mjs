// Manual smoke test: runs the real Claude Code CLI through the adapter.
// Usage: node packages/providers/scripts/smoke.mjs "<prompt>" [cwd]
import { ClaudeCodeProvider } from "../dist/index.js";

const prompt = process.argv[2] ?? "Reply with exactly the word: pong";
const cwd = process.argv[3] ?? process.cwd();
const provider = new ClaudeCodeProvider();

console.log("check:", await provider.check());
for await (const event of provider.run({ prompt, cwd })) {
  console.log(JSON.stringify(event));
}
