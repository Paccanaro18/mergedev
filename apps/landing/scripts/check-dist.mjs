// Verifica o resultado do build contra as regras de segurança da landing.
// Roda depois de `astro build`; falha (exit 1) se achar algo que quebraria
// uma CSP estrita ou que carregue recurso de terceiros.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

// Únicos hosts externos permitidos (só em links <a>, nunca em recursos).
const ALLOWED_LINK_PREFIX = "https://github.com/Paccanaro18/mergedev";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const errors = [];
const fail = (file, message) => errors.push(`${relative(root, file)}: ${message}`);

let files;
try {
  files = walk(dist);
} catch {
  console.error("dist/ não existe. Rode `astro build` primeiro.");
  process.exit(1);
}

for (const file of files) {
  if (file.endsWith(".html")) {
    const html = readFileSync(file, "utf8");

    if (/<style[\s>]/i.test(html)) fail(file, "tag <style> inline");
    if (/\sstyle\s*=/i.test(html)) fail(file, "atributo style= inline");
    if (/\son[a-z]+\s*=/i.test(html)) fail(file, "handler on*= inline");
    if (/javascript:/i.test(html)) fail(file, "URL javascript:");

    for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
      if (!/\ssrc\s*=/i.test(match[1])) fail(file, "<script> sem src (inline)");
    }

    for (const match of html.matchAll(/<(a|link|script|img|source|iframe|form)\b[^>]*>/gi)) {
      const tag = match[0];
      const tagName = match[1].toLowerCase();
      const url = /\s(?:href|src|action)\s*=\s*"(https?:\/\/[^"]+)"/i.exec(tag)?.[1];
      if (!url) continue;
      if (tagName !== "a") {
        fail(file, `recurso externo em <${tagName}>: ${url}`);
      } else if (!url.startsWith(ALLOWED_LINK_PREFIX)) {
        fail(file, `link externo fora do repositório: ${url}`);
      } else if (!/\srel\s*=\s*"[^"]*noopener[^"]*noreferrer[^"]*"/i.test(tag)) {
        fail(file, `link externo sem rel="noopener noreferrer": ${url}`);
      }
    }
  }

  if (file.endsWith(".css")) {
    const css = readFileSync(file, "utf8");
    if (/@import\s+(url\()?["']?https?:/i.test(css)) fail(file, "@import externo");
    if (/url\(\s*["']?https?:/i.test(css)) fail(file, "url() externo");
  }
}

// vercel.json precisa ter os cabeçalhos exigidos.
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const headers = new Map(
  vercel.headers.flatMap((rule) => rule.headers.map((h) => [h.key.toLowerCase(), h.value])),
);
for (const key of [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
]) {
  if (!headers.has(key)) fail(join(root, "vercel.json"), `cabeçalho ausente: ${key}`);
}
if (!/frame-ancestors/.test(headers.get("content-security-policy") ?? "")) {
  fail(join(root, "vercel.json"), "CSP sem frame-ancestors");
}

if (errors.length > 0) {
  console.error(`\ncheck-dist falhou (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-dist ok: ${files.length} arquivos, sem inline, sem recursos de terceiros.`);
