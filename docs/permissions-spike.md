# Spike 2.2 — Aprovação interativa de permissões em modo headless

Testado em Windows com `claude` 2.1.319 (login do usuário, sem API key). Todos os trechos abaixo são saída real; caminhos locais foram trocados por `/work/project`. Capturas completas (filtradas) em `packages/providers/test-fixtures/permission-allow.jsonl` e `permission-deny.jsonl`.

## Resumo

**O que funciona:** `claude -p --input-format stream-json --output-format stream-json --verbose --permission-mode manual --permission-prompt-tool stdio`.

Com isso o CLI **pausa** antes da ação e emite uma `control_request` (`can_use_tool`) no stdout. O host responde com uma `control_response` no stdin (`allow` ou `deny`) e o run continua. Não precisa de servidor MCP nem de hook.

`--permission-prompt-tool stdio` não aparece no `claude --help` desta versão; o `--help` só cita `--permission-prompt-tool` dentro da descrição de `--permission-prompts`.

## Experimentos

### 1. Como é hoje (`-p`, texto no stdin)

- `--permission-mode acceptEdits`: `mkdir` (e outros comandos de arquivo) é aprovado sozinho. Um `echo` também roda sem pedir. Nenhuma pergunta é possível.
- `--permission-mode manual`: a ação é **negada na hora**, sem perguntar. O CLI emite um evento informativo e o modelo recebe o erro:

```json
{"type":"system","subtype":"permission_denied","tool_name":"Bash","message":"mkdir in '/work/project/made-by-claude' needs approval. ..."}
```

Ou seja: em `-p` puro não há como aprovar; é preciso mudar o transporte.

### 2. `--input-format stream-json` sozinho

Com `--permission-mode manual` **sem** `--permission-prompt-tool`, o resultado é o mesmo do item 1: negação automática com `permission_denied`. O stream-json de entrada só não basta.

### 3. `--permission-prompt-tool stdio` (funciona)

Entrada: uma mensagem de usuário por linha (NDJSON) no stdin:

```json
{"type":"user","message":{"role":"user","content":"Use the Bash tool to run exactly: mkdir made-by-claude && echo ok . Then say done."}}
```

Saída (stdout), na ordem observada: `assistant` com o `tool_use`, depois o pedido de permissão:

```json
{"type":"control_request","request_id":"e14df67f-36ec-4153-b1c8-b8afdabd5b89","request":{"subtype":"can_use_tool","tool_name":"Bash","display_name":"Bash","input":{"command":"mkdir made-by-claude && echo ok","description":"Create directory and echo ok"},"description":"Create directory and echo ok","permission_suggestions":[{"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"mkdir made-by-claude *"}],"behavior":"allow","destination":"localSettings"},{"type":"addDirectories","directories":["/work/project"],"destination":"session"},{"type":"setMode","mode":"acceptEdits","destination":"session"}],"blocked_path":"/work/project/made-by-claude","tool_use_id":"toolu_01PPqmmmANmiH6vNGhK7Vnpv"}}
```

Campos úteis para a UI: `request_id` (para responder), `tool_name`, `input`, `description`, `tool_use_id` (casa com o `tool.call.callId` já existente) e `permission_suggestions` (opções como "permitir sempre este comando").

**Aprovar** (escrever no stdin):

```json
{"type":"control_response","response":{"subtype":"success","request_id":"<request_id>","response":{"behavior":"allow","updatedInput":{"command":"mkdir made-by-claude && echo ok","description":"Create directory and echo ok"}}}}
```

Resultado: a ação executou (o diretório foi criado), o `tool_result` voltou com `"ok"` e o run terminou com `result/success`.

**Negar:**

```json
{"type":"control_response","response":{"subtype":"success","request_id":"<request_id>","response":{"behavior":"deny","message":"Denied by Merge user"}}}
```

Resultado: a ação **não** executou. O modelo recebeu como `tool_result` com erro e o run terminou normalmente:

```json
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"Denied by Merge user","is_error":true,"tool_use_id":"toolu_019BmqALHi61ZNnnP6AfResT"}]}, ...}
```

**Sem resposta:** o processo fica parado esperando, indefinidamente (nenhum timeout em 15 s, nada executado). Encerrar o processo (cancelar via `AbortSignal`, como já fazemos) basta para abortar o run; o pedido pendente simplesmente some.

### 4. Ciclo de vida com stdin aberto

Com `--input-format stream-json` o processo **não termina sozinho** ao fim do run: depois do evento `result` ele espera outra mensagem de usuário. O host precisa fechar o stdin (`child.stdin.end()`) após o `result` para o processo sair (testado: sai com código 0). Isso também é a base para a tarefa 2.4 (follow-ups na mesma sessão), mas fora do escopo aqui.

### 5. Hooks (`PreToolUse`) — não testado, não recomendado

Um hook roda como **processo separado por chamada** e teria que falar com o app por algum canal próprio (socket/arquivo), além de exigir escrever em `settings`. Faz o mesmo que o item 3 com mais peças. Não foi testado por esse motivo.

### 6. `--permission-prompt-tool` com servidor MCP — não testado

É a forma "oficial" documentada para quem não usa stream-json de entrada, mas exigiria um servidor MCP local rodando só para receber a decisão. O mecanismo `stdio` do item 3 resolve o mesmo problema sem isso. Só vale revisitar se o `stdio` desaparecer em versões futuras.

## Recomendação

Usar o item 3 (`stdio` + `control_request`/`control_response`). Mudanças necessárias no adapter do Claude Code:

1. Trocar `child.stdin.end(prompt)` por escrever a mensagem `user` em NDJSON e **manter o stdin aberto** até o `result`.
2. Em `parseClaudeLine`, reconhecer `control_request` com `subtype: "can_use_tool"` e produzir um evento de pedido de permissão.
3. Quando o host responde, escrever a `control_response` no stdin.
4. Fechar o stdin após o `result` e manter o fluxo atual de cancelamento (matar o processo).
5. Só usar esse caminho quando o modo de permissão for interativo; modos `acceptEdits`/`bypassPermissions` continuam como hoje (sem stdin aberto).

Riscos: a flag é pouco documentada nesta versão, então o adapter deve falhar de forma clara se o CLI rejeitar `--permission-prompt-tool`. Isso deve ser coberto por teste com fixture real a cada atualização relevante do CLI.

## Proposta de eventos no `@merge/core`

Aditivo (não quebra nada existente):

```ts
export type AgentEvent =
  | /* ...eventos atuais... */
  | {
      type: "permission.requested";
      /** Identifica o pedido; usado para responder. */
      requestId: string;
      /** Casa com tool.call.callId. */
      callId: string;
      tool: string;
      input: unknown;
      description?: string;
    }
  | {
      type: "permission.resolved";
      requestId: string;
      decision: "allow" | "deny";
      reason?: string;
    };
```

`permission.requested` vem do provider. `permission.resolved` é emitido pelo runner depois que a decisão é entregue, para ficar gravado no histórico do run.

Como a decisão volta ao provider: `RunInput` ganha um callback opcional, em vez de um canal extra:

```ts
export interface PermissionDecision {
  decision: "allow" | "deny";
  reason?: string;
}

export interface RunInput {
  // ...campos atuais...
  /** Chamado quando o agente pede permissão. Se ausente, o provider mantém o comportamento atual (sem interação). */
  onPermissionRequest?: (req: { requestId: string; tool: string; input: unknown; description?: string }) => Promise<PermissionDecision>;
}
```

O provider aguarda a promise, escreve a `control_response` e segue. O `Runner` recebe `onPermissionRequest` nas opções de `runTask` e o repassa; a UI (via IPC) resolve a promise quando o usuário clica. Cancelar o run (`AbortSignal`) deve rejeitar/descartar promises pendentes.

Fora do escopo do spike (decidir na implementação): "permitir sempre" usando `permission_suggestions` e o que fazer com pedidos pendentes se o app fechar (por padrão, o processo morre junto).
