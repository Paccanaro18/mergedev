---
name: vercel-landing-deploy
description: Como a landing page do Merge (apps/landing, Astro estático) é publicada na Vercel e como o botão de download aponta para os instaladores nos GitHub Releases. Use ao mexer em apps/landing, vercel.json, links de download, checksums, domínio, variáveis de ambiente do deploy ou ao configurar/diagnosticar o projeto na Vercel.
---

# Deploy da landing na Vercel (com segurança)

## Decisões já tomadas

- A landing é **100% estática** (`output: "static"`, sem SSR e sem adapter), em `apps/landing`.
- O deploy é pela **integração GitHub ↔ Vercel**. **Sem token da Vercel no GitHub Actions** e sem deploy por CLI. Merge na `main` publica em produção; cada PR gera uma prévia.
- O instalador do app **não** passa pela Vercel: o botão de download aponta para os **GitHub Releases** (`releases/latest/download/<arquivo>`, nomes fixos, sem versão).
- A landing **não tem segredo, não tem variável de ambiente e não tem analytics**. Se alguma vier a ser necessária, discuta antes (ver "Mudanças que exigem decisão").

## Configuração do projeto na Vercel (feita no painel pelo dono)

- **Root Directory:** `apps/landing`. Deixe ligada a opção de incluir arquivos fora do Root Directory no build (o `package-lock.json` está na raiz do monorepo). Confirme que o install usa o lockfile da raiz.
- **Production Branch:** `main`.
- **Ignored Build Step:** pular o build quando nada relevante mudou, para uma mudança só no app não republicar a landing. Comando sugerido: `git diff --quiet HEAD^ HEAD -- apps/landing package.json package-lock.json` (código de saída 0 = pula). Confirme no painel o comportamento do seu plano.
- **Environment Variables:** nenhuma. Se algum dia houver, nunca com prefixo `PUBLIC_`/`VITE_` para valores sensíveis (vão para o navegador).
- **Deployment Protection:** mantenha a proteção das prévias ligada (previews não precisam ser públicos). A produção é pública.
- **Contas:** 2FA ligado na conta da Vercel e na do GitHub. Sem tokens pessoais guardados no repositório. A conta que administra o projeto não é compartilhada.
- **Domínio próprio (se houver):** configure o DNS só depois de adicionar o domínio no projeto. **Não deixe registro DNS apontando para a Vercel sem projeto** (risco de tomada de subdomínio). Ao desativar um domínio, remova o registro.

## Cabeçalhos de segurança e CSP

`apps/landing/vercel.json` define uma **CSP estrita** (`default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'none'`, `frame-ancestors 'none'`...), HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e COOP. Para essa CSP funcionar:

- **Sem** `<style>` inline, `style=""`, handlers `on*=` ou `javascript:`. O `astro.config.mjs` força `inlineStylesheets: "never"` e `assetsInlineLimit: 0` por isso. Não desfaça.
- **Sem** scripts, fontes, imagens ou CSS de terceiros. As fontes são locais (`src/assets/fonts`, com a licença junto).
- `scripts/check-dist.mjs` roda no build e **falha** se achar inline, recurso externo ou host não permitido. Ele só permite links `<a>` para `https://github.com/Paccanaro18/mergedev`. **Não enfraqueça esse script para fazer o build passar**; corrija a causa.
- O download é navegação por `<a href>`, que a CSP não bloqueia. Se algum dia o JS precisar de `fetch` (por exemplo à API do GitHub), isso exige abrir `connect-src` para um único host, e é uma **decisão de segurança**: discuta antes.
- Links externos: `rel="noopener noreferrer"`.

## Links de download e checksums

- Fonte única: `apps/landing/src/config.ts`. Nomes fixos: `Merge-Setup.exe`, `Merge.dmg`, `Merge.AppImage` (a tarefa 5.1 confirma).
- Enquanto `RELEASE_PUBLISHED = false`, todo botão aponta para `RELEASES_URL` ("em breve"); os links diretos dariam 404. **Só mude para `true` depois** que existir um release com os três arquivos e você tiver testado cada link.
- Preencha o `sha256` de cada instalador **a partir do arquivo do release** (não de um build local). Mostre também o comando de conferência.
- Os instaladores saem do CI, a partir da tag do release-please. Nunca suba instalador feito na máquina de alguém.
- O aviso de instalador **sem assinatura** (SmartScreen, Gatekeeper) fica visível enquanto for verdade. Remova só quando o instalador for assinado de fato.

## Verdade no conteúdo

A página é pública e vira promessa. Ela só pode afirmar o que o produto **entrega hoje**. Antes de publicar, confira cada afirmação sobre agentes, plataformas, privacidade ("100% local") e assinatura contra o estado real do código e do ROADMAP. Recurso futuro aparece como "em breve", nunca como disponível.

## Antes de abrir a PR da landing

- [ ] `npm run build -w @merge/landing` passa (inclui `check-dist.mjs`).
- [ ] `npm test -w @merge/landing` passa.
- [ ] Abriu a página no navegador (desktop e celular), com o console aberto: **nenhuma violação de CSP**.
- [ ] Nenhum recurso de terceiros, nenhum segredo, nenhum `.vercel/` ou `.env*` no diff.
- [ ] Links de download e checksums testados, ou `RELEASE_PUBLISHED` continua `false`.
- [ ] Textos conferidos com o que o produto realmente faz.

## Depois do deploy

- Abra a URL de produção e confira os cabeçalhos: `curl -sI https://<dominio>` deve mostrar `content-security-policy`, `strict-transport-security`, `x-content-type-options`, etc.
- Teste os três botões de download e a página de releases.
- Se algo estiver errado, use o **Instant Rollback** da Vercel (painel → Deployments → versão anterior → Promote to Production) e só depois corrija na `main`.

## Mudanças que exigem decisão do dono (pare e pergunte)

- Adicionar analytics, fontes ou scripts externos, ou abrir `connect-src`/`script-src`.
- Criar variável de ambiente ou qualquer token ligado à Vercel.
- Mudar para deploy por CLI/Actions, trocar o domínio ou o Root Directory.
- Declarar na página um recurso, plataforma ou garantia que ainda não existe.
