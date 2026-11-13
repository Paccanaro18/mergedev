# @merge/landing

Landing page estática do Merge (Astro, sem SSR e sem adapter). O objetivo do site é apresentar o produto e levar o usuário ao download do app desktop.

## Comandos

```bash
npm run dev -w @merge/landing      # servidor de desenvolvimento
npm run build -w @merge/landing    # build estático em apps/landing/dist + check-dist
npm run preview -w @merge/landing  # serve o dist localmente
npm run check -w @merge/landing    # astro check (tipos)
npm test -w @merge/landing         # testes da detecção de sistema
```

## Quando os instaladores forem publicados (tarefa 5.1)

Tudo está em [`src/config.ts`](src/config.ts):

1. Confirme os nomes fixos dos arquivos em `INSTALLERS` (`Merge-Setup.exe`, `Merge.dmg`, `Merge.AppImage`). Os links diretos são `https://github.com/Paccanaro18/mergedev/releases/latest/download/<arquivo>`.
2. Preencha o `sha256` de cada instalador. Enquanto for `null`, a página diz que o hash ainda não foi publicado.
3. Troque `RELEASE_PUBLISHED` para `true`. Com `false`, todo botão aponta para `releases/latest` e a página mostra "Download em breve", porque os links diretos dariam 404 sem release.

Sem JavaScript, o botão principal leva a `releases/latest`. Com JavaScript, `src/scripts/download.ts` detecta Windows, macOS ou Linux e aponta o botão para o instalador certo. Em celular e tablet nenhum sistema é destacado.

## Segurança

- Sem scripts, fontes ou imagens de terceiros. As fontes (Poppins, Lora e JetBrains Mono, licença OFL) ficam em `src/assets/fonts`, só o subconjunto latino.
- Sem `<style>`, `style=` ou `<script>` inline, para funcionar com CSP estrita. `npm run build` roda `scripts/check-dist.mjs`, que falha se encontrar inline, recurso externo ou link externo fora do repositório sem `rel="noopener noreferrer"`.
- `vercel.json` define os cabeçalhos (CSP com `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`). Eles só valem na Vercel: `astro preview` e `astro dev` não os aplicam.
- Sem analytics e sem variáveis de ambiente.

## Design

Tokens e layout vêm do arquivo MERGE DEV no Paper (tema escuro). O tema claro é derivado do mesmo sistema; em `src/styles/tokens.css` o acento usado como texto escurece no claro para manter contraste.

## Movimento

Todo o movimento é CSS (`src/styles/motion.css`) mais um módulo pequeno e local (`src/scripts/motion.ts`), sem bibliotecas:

- fundo vivo (grade e brilhos com parallax), faixas que convergem no hero, janela do app animada, brilho em "Um só lugar.";
- faixa de agentes em duas fileiras que rolam em sentidos opostos (a lista vem de `AGENTS` em `src/config.ts`);
- header fixo com barra de progresso e seção atual destacada, cards que entram ao rolar e luz que segue o cursor;
- diagrama de privacidade com dados trafegando (e um pacote barrado a caminho do "servidor").

Acessibilidade: `prefers-reduced-motion` desliga tudo, e o botão "Pausar animações" (na faixa de agentes) faz o mesmo e lembra a escolha em `localStorage`. Sem JavaScript a página continua completa; o JS só liga reveal, parallax e a luz do cursor, e só mexe no CSSOM (compatível com a CSP estrita).
