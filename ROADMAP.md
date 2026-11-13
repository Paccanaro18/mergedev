# Merge — Roadmap

Plataforma desktop para orquestrar agentes de código (Claude Code, Codex e outros) dentro de projetos e tarefas. Tudo roda local na máquina do usuário. Uma landing page serve só para baixar o app.

Cada tarefa abaixo foi escrita para caber em **um chat/PR independente**: tem objetivo, escopo, critério de pronto e dependências.

## Como começar um chat novo

Cole algo como:

> Leia `ROADMAP.md` e o código em `packages/`. Vamos fazer a tarefa **X.Y**. Siga as convenções do roadmap.

## Convenções (valem para todas as tarefas)

- TypeScript estrito, npm workspaces. Dependências sempre apontam para dentro: `apps → runner → providers → core`. O `core` não depende de nada.
- Um provider novo é só um adapter que implementa `AgentProvider` e traduz a saída do CLI para `AgentEvent`. Nada fora de `packages/providers` conhece detalhes de um provider.
- Providers controlam o **CLI oficial** (usa o login do usuário). Sem API key e sem Agent SDK.
- Persistência atrás da interface `Store`. Hoje: SQLite via `node:sqlite`.
- Parsers de CLI são testados com **saída real capturada** (fixtures em `test-fixtures/`), não com saída inventada.
- Uma feature = uma branch (`feature/...`) a partir de `main` = uma PR. O dono do projeto aceita a PR no GitHub. Commits e PRs **sem** marca/atribuição do Claude.
- Antes de abrir a PR: `npx tsc -b` e os testes dos pacotes tocados passando.

## Fase 0 — Núcleo (concluída)

| ID | Entrega | Status |
|---|---|---|
| 0.1 | Monorepo + `@merge/core` (entidades, `AgentEvent`, `AgentProvider`, `Store`) | feito (PR #1) |
| 0.2 | Adapter do Claude Code (`claude -p --output-format stream-json`) + parser testado | feito (PR #1) |
| 0.3 | `@merge/store` (SQLite) + `@merge/runner` | PR #2 |

## Fase 1 — App desktop mínimo

Objetivo: usar o núcleo por uma janela de verdade. Só o Claude Code por enquanto.

### 1.1 Shell do Electron
- **Escopo:** `apps/desktop` com Electron + React + Vite (electron-vite). O processo principal cria `SqliteStore` (arquivo em `userData`) e `Runner`. A UI conversa por IPC com uma API tipada (preload + `contextBridge`, `contextIsolation` ligado). Verificar que `node:sqlite` funciona na versão do Node embutida no Electron; se não, trocar por `better-sqlite3` só dentro de `@merge/store`.
- **Pronto quando:** `npm run dev -w @merge/desktop` abre a janela e ela lista os projetos vindos do SQLite via IPC.
- **Depende de:** 0.3.

### 1.2 Projetos e tarefas
- **Escopo:** adicionar projeto escolhendo uma pasta (diálogo nativo), listar projetos, criar e listar tarefas por projeto. Estado vazio e erros tratados.
- **Pronto quando:** dá para criar projeto e tarefas pela UI e elas continuam após reabrir o app.
- **Depende de:** 1.1.

### 1.3 Executar tarefa com eventos ao vivo
- **Escopo:** botão "Executar" (provider Claude Code), stream de `AgentEvent` do main para a UI (mensagens, chamadas de tool com entrada/saída), botão "Cancelar" usando `AbortSignal`. Aviso claro se o `claude` não estiver instalado ou logado (`provider.check()`).
- **Pronto quando:** rodar uma tarefa real mostra os eventos em tempo real e o cancelamento encerra o processo.
- **Depende de:** 1.2.

### 1.4 Histórico de runs
- **Escopo:** lista de runs por tarefa (status, duração, custo), abrir um run antigo e reler os eventos gravados.
- **Pronto quando:** runs passados aparecem e reabrem com os mesmos eventos.
- **Depende de:** 1.3.

### 1.5 CI (pode rodar em paralelo a qualquer tarefa)
- **Escopo:** GitHub Actions rodando `tsc -b` e testes em Windows e Linux a cada PR. `.gitattributes` para padronizar fim de linha.
- **Pronto quando:** PR mostra checks verdes ou vermelhos.
- **Depende de:** 0.3.

## Fase 2 — Isolamento e controle

### 2.1 Git worktree por run
- **Escopo:** cada run (ou tarefa) executa num git worktree próprio, para o agente não mexer na pasta principal. Módulo novo `packages/workspace` (criar, remover, status). Mostrar diff do resultado na UI e permitir descartar ou manter a branch.
- **Pronto quando:** rodar uma tarefa produz uma branch isolada com diff visível e a pasta original fica intacta.
- **Depende de:** 1.4.

### 2.2 Aprovação interativa de permissões
- **Escopo:** hoje o run usa `acceptEdits`. Permitir que ações como Bash peçam aprovação na UI (investigar o mecanismo do CLI para permissões em modo headless, p. ex. `--permission-prompt-tool` ou entrada `stream-json`). Novos eventos no `core` para pedido e resposta de permissão.
- **Pronto quando:** uma ação fora da lista permitida pausa o run e a UI aprova ou nega.
- **Depende de:** 1.3. Exige spike de pesquisa antes de implementar.

### 2.3 Configuração por provider e por projeto
- **Escopo:** tela de configurações: modo de permissão, tools permitidas, caminho do binário, status do provider (instalado/logado).
- **Pronto quando:** as opções salvas afetam o run seguinte.
- **Depende de:** 1.3.

### 2.4 Retomar sessão
- **Escopo:** continuar uma conversa de um run anterior (`--resume <sessionId>`) para follow-ups na mesma tarefa.
- **Pronto quando:** dá para enviar uma nova instrução a uma tarefa e o agente mantém o contexto.
- **Depende de:** 1.4.

## Fase 3 — Mais providers

### 3.1 Adapter do Codex
- **Escopo:** `packages/providers/src/codex` (`codex exec --json`), parser com fixtures reais, `check()` de instalação e login. Precisa de uma máquina com Codex instalado para capturar saída real.
- **Pronto quando:** a mesma tarefa roda com Codex pela UI sem mudanças no `runner`. Se o `AgentEvent` precisar mudar, ajustar o `core` de forma compatível.
- **Depende de:** 1.3.

### 3.2 Provider genérico por comando
- **Escopo:** permitir cadastrar um agente por linha de comando (comando, argumentos, formato de saída simples) para testar CLIs novos sem escrever adapter dedicado.
- **Depende de:** 3.1.

### 3.3 Escolher e comparar providers
- **Escopo:** escolher o provider ao executar e rodar a mesma tarefa com dois providers para comparar resultados lado a lado (cada um no seu worktree).
- **Depende de:** 2.1, 3.1.

## Fase 4 — Multi-agente

### 4.1 Execução paralela
- **Escopo:** vários runs simultâneos com limite de concorrência e fila no `runner`; UI mostra todos em andamento.
- **Depende de:** 2.1.

### 4.2 Tipos de agente (papéis)
- **Escopo:** entidade `AgentProfile` (nome, provider, prompt de sistema, permissões), por exemplo implementador, revisor e testador. Tarefas escolhem um perfil.
- **Depende de:** 2.3.

### 4.3 Encadeamento de tarefas
- **Escopo:** dependências entre tarefas e pipelines simples (implementar → revisar → testar), passando o resultado de uma etapa como contexto da próxima.
- **Depende de:** 4.1, 4.2.

## Fase 5 — Distribuição e landing page

### 5.1 Empacotamento
- **Escopo:** `electron-builder` gerando instaladores para Windows, macOS e Linux; workflow do GitHub Actions publicando em GitHub Releases ao criar uma tag.
- **Atenção:** assinatura de código (Windows/macOS) tem custo e burocracia; decidir se o MVP sai sem assinatura, com aviso ao usuário.
- **Depende de:** 1.4, 1.5.

### 5.2 Auto-update
- **Escopo:** `electron-updater` apontando para os Releases.
- **Depende de:** 5.1.

### 5.3 Landing page
- **Escopo:** `apps/landing` estática (Astro ou Vite), descrição do produto e botões de download que apontam para o release mais recente por sistema operacional. Hospedar no GitHub Pages ou similar.
- **Depende de:** 5.1.

## Ordem sugerida e paralelismo

```
0.3 → 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 3.3
                 │      │      └→ 4.1 → 4.3
                 │      ├→ 2.2, 2.3 → 4.2 → 4.3
                 │      └→ 3.1 → 3.2
                 └ (1.5 CI em paralelo)        1.4 → 2.4
5.1 → 5.2, 5.3  (pode começar depois da 1.4)
```

Tarefas que podem ir em chats paralelos sem conflito: 1.5, 3.1 (depois da 1.3), 5.x (depois da 1.4).

## Riscos e decisões em aberto

- `node:sqlite` dentro do Electron: validar na 1.1 e ter o plano B (`better-sqlite3`) isolado no `store`.
- Permissões em modo headless (2.2): é a parte menos conhecida; fazer spike antes.
- Codex só pode ser testado de verdade em máquina com assinatura; até lá, apenas com fixtures.
- Assinatura de código dos instaladores (5.1).
- Testado apenas em Windows até agora; CI (1.5) cobre Linux, e macOS precisa de teste manual.
