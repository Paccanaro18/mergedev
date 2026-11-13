# Merge — regras para agentes

Plataforma desktop (Electron + TypeScript) que orquestra agentes de código (Claude Code, Codex...) em projetos e tarefas. **Código aberto e repositório público**: tudo que for commitado, inclusive o histórico, é visto por qualquer pessoa. Leia `ROADMAP.md` antes de começar uma tarefa.

## Estrutura

- `packages/core` (tipos e interfaces), `providers`, `store`, `runner`, `workspace`: lógica, sem UI.
- `apps/desktop`: app Electron (main, preload, renderer).
- `apps/landing`: landing page estática (Astro), publicada na Vercel.
- Dependências sempre apontam para dentro: `apps → runner → providers → core`. O `core` não depende de nada.
- Nada fora de `packages/providers` conhece detalhes de um provider. Providers controlam o **CLI oficial** (login do usuário), sem API key e sem Agent SDK.
- Parsers e adapters são testados com **saída real capturada** (fixtures em `test-fixtures/`), nunca inventada.

## Fluxo de trabalho

- Uma feature = uma branch `feature/...` a partir da `main` atualizada = uma PR. **O dono do projeto aceita a PR no GitHub**; nunca faça push direto na `main`.
- **Commits e PRs sem nenhuma marca ou atribuição do Claude** (sem `Co-Authored-By`, sem "Generated with").
- Título de PR e de commit com prefixo `feat:`, `fix:` ou `chore:` (o release-please, em implantação, decide a versão do app por eles). Mudança só de documentação: `docs:`.
- Antes de abrir a PR: `npx tsc -b` e os testes dos pacotes tocados. Se mexeu no desktop: `npm run typecheck -w @merge/desktop`. Se mexeu na landing: `npm run build -w @merge/landing`.
- Na descrição da PR, diga **o que foi testado e o que não foi**. Não afirme que algo funciona sem ter rodado.
- Mostre o plano ao dono antes de mudanças grandes ou que toquem configuração, CI, segurança ou o repositório no GitHub.
- Não duplique trabalho: veja as PRs abertas (`gh pr list`) e os arquivos que elas tocam antes de mexer em `apps/desktop`.

## Segurança (resumo; detalhes em `.claude/skills/`)

- **Nunca** commite segredos: tokens, chaves, `.env*`, certificados, `.vercel/`. Se um segredo vazou, **revogue primeiro**; reescrever o histórico não desfaz o vazamento num repositório público.
- Não adicione dependência nova sem justificar (necessidade, manutenção, licença, scripts de instalação). Use `npm ci`, nunca `npm install` em CI.
- Workflows do GitHub: `permissions` mínimas, actions fixadas por **SHA**, nada de `pull_request_target` com checkout de código de PR, nada de valor do `github.context` interpolado direto num `run:`.
- Electron: mantenha `contextIsolation` e `sandbox` ligados e `nodeIntegration` desligado; valide **toda** entrada de IPC no processo principal.
- A landing page só diz o que o produto realmente faz hoje. Não anuncie recurso que não foi entregue.
- Em dúvida sobre segurança, pare e pergunte.

## Skills

- `security-baseline`: segredos, dependências, CI, Electron e releases.
- `vercel-landing-deploy`: publicação da landing page (`apps/landing`) na Vercel e links de download.
