---
name: security-baseline
description: Regras de segurança do Merge (repositório público). Use ao mexer em segredos ou variáveis de ambiente, dependências, workflows do GitHub Actions, IPC e janelas do Electron, execução de comandos pelos agentes, releases e instaladores, ou ao revisar uma PR com impacto de segurança.
---

# Linha de base de segurança

O repositório é **público** e o app executa comandos na máquina do usuário. Trate cada mudança como se qualquer pessoa fosse ler e tentar abusar dela.

## 1. Segredos

- Nunca no código, em fixtures, em logs, em mensagens de commit ou na descrição de PR. Isso inclui tokens, chaves de API, certificados (`*.pem`, `*.p12`, `*.pfx`), `.env*` e a pasta `.vercel/`. O `.gitignore` cobre esses nomes; não tente contorná-lo.
- **Fixtures capturadas de CLIs** (`test-fixtures/`) podem conter caminhos de usuário, e-mail, IDs de sessão e saída de ferramentas. Revise e anonimize antes de commitar (padrão: `/work/project`).
- O app grava eventos do agente no SQLite, e a saída de ferramentas pode conter segredos do projeto do usuário. Não envie esses dados para fora da máquina, e não os imprima em logs.
- **Se um segredo vazou:** (1) revogue/rotacione imediatamente; (2) só depois remova do código. Reescrever o histórico de um repositório público **não** resolve, porque o valor já foi copiado. O push protection e o secret scanning do GitHub estão ligados; um bloqueio deles nunca deve ser contornado com "permitir".
- Variáveis de ambiente de build com prefixo público (`PUBLIC_`, `VITE_`, `NEXT_PUBLIC_`) vão para o navegador. Nunca coloque segredo nelas.

## 2. Dependências

- Instale com `npm ci` (usa o `package-lock.json`). Commite o lockfile junto com qualquer mudança de dependência.
- Antes de adicionar um pacote: ele é realmente necessário? É mantido? A licença é compatível? Tem script de `install`/`postinstall`? Prefira a biblioteca padrão do Node.
- Fora do app desktop, instale com `--ignore-scripts` quando o pacote não precisar de script (o Electron baixa um binário no install; o CI pula isso com `ELECTRON_SKIP_BINARY_DOWNLOAD`).
- O Dependabot abre PRs semanais. Revise o changelog de majors; não mescle atualização que você não entende.

## 3. GitHub Actions

- `permissions:` no topo do workflow, começando em `contents: read`. Eleve **só no job** que precisa (por exemplo `contents: write` no job que publica o release).
- Actions de terceiros **fixadas por SHA de commit** (`uses: org/acao@<sha> # vX.Y.Z`). Tag ou branch podem ser movidas.
- **Nunca** `pull_request_target` com checkout/execução de código vindo da PR. **Nunca** interpolar `${{ github.* }}`, títulos de PR ou nomes de branch direto num `run:`. Passe por `env:` e use como variável do shell.
- `actions/checkout` com `persist-credentials: false`, a menos que o job precise fazer push.
- Segredos de Actions só nos jobs que precisam, nunca em jobs disparados por PR de fork.
- O check que a proteção da `main` exige é **`CI OK`** (job final do `ci.yml`; área pulada conta como sucesso).

## 4. Electron (`apps/desktop`)

- Mantenha `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. Não carregue conteúdo remoto numa janela com preload.
- O preload expõe **apenas** a API tipada de `shared/api.ts`. Nunca exponha `ipcRenderer` ou `require`.
- **Todo handler de IPC valida a entrada** no processo principal: tipos, valores permitidos, ids que existem. O renderer não é confiável. Veja `settings-ipc.ts` como modelo.
- Não abra URL externa com `shell.openExternal` sem validar o esquema (`https:`) e o destino. Navegação e novas janelas continuam bloqueadas.
- Caminhos vindos do renderer (projetos, worktrees) nunca são usados para ler ou apagar nada fora do que o app criou. Operações destrutivas (descartar worktree, apagar branch) só em recursos que o Merge criou.

## 5. Agentes e execução de comandos

- O padrão é `acceptEdits` com aprovação interativa para o resto. **Não** mude o padrão para `bypassPermissions`; se o usuário escolher, é uma configuração explícita dele.
- Runs isolados (`isolate`) usam worktree próprio; a pasta original não deve ser alterada.
- O mecanismo `--permission-prompt-tool stdio` é pouco documentado: falhe de forma clara se o CLI o rejeitar, e nunca aprove automaticamente por erro.
- O texto de pedido de permissão é exibido ao usuário exatamente como veio do agente (ferramenta, comando completo). Não resuma nem esconda parte do comando.

## 6. Releases e instaladores (tarefas 5.1/5.2)

- Instaladores **só** saem do CI, a partir de uma tag criada pelo release-please. Nunca construa e suba um release da sua máquina.
- Publique **checksums SHA-256** junto do release e preencha-os em `apps/landing/src/config.ts`. Considere gerar attestation de proveniência.
- Permissão de escrita (`contents: write`) apenas no job de publicação. Tags `v*` protegidas.
- O MVP pode sair **sem assinatura**; nesse caso a landing precisa avisar (já avisa). Nunca esconda esse aviso.
- Auto-update (5.2) só aceita atualizações do repositório oficial, por HTTPS, e deve verificar integridade/assinatura antes de instalar.

## 7. Revisão rápida antes de abrir a PR

- [ ] `git diff --staged` não contém segredo, caminho pessoal nem e-mail.
- [ ] Nenhum `.env*`, `.vercel/`, certificado ou chave entrou.
- [ ] Dependência nova justificada e lockfile atualizado.
- [ ] Workflow novo/alterado: `permissions` mínimas, actions por SHA, sem interpolação perigosa.
- [ ] Handler de IPC novo valida a entrada e tem teste (ou foi exercitado no Electron real).
- [ ] A descrição da PR diz o que foi testado e o que não foi.
