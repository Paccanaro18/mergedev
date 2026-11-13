# Política de segurança

O Merge é um projeto de código aberto que roda na máquina do usuário e controla agentes de código com acesso a pastas e comandos. Levamos relatos de segurança a sério.

## Como reportar uma vulnerabilidade

**Não abra uma issue pública** para falhas de segurança.

Use o relato privado do GitHub: na página do repositório, aba **Security** → **Report a vulnerability**. Descreva o que acontece, como reproduzir e qual o impacto. Responderemos o mais rápido possível.

## O que está no escopo

- O aplicativo desktop (`apps/desktop`) e os pacotes em `packages/`: execução de comandos, aprovação de permissões, isolamento em worktrees, armazenamento local e IPC entre as janelas e o processo principal.
- A landing page (`apps/landing`) e o processo de build e de publicação dos instaladores.

## Versões suportadas

Apenas a versão mais recente publicada nos [Releases](../../releases/latest) recebe correções de segurança.

## Baixando o Merge com segurança

Baixe o instalador **somente** pela landing page oficial ou pelos [Releases](../../releases) deste repositório. Instaladores de outras origens não são nossos. Quando houver checksums SHA-256 no release, confira o arquivo baixado antes de executá-lo.
