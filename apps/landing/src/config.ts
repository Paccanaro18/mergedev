/**
 * Configuração única da landing: links de download, checksums e agentes.
 *
 * A tarefa 5.1 (empacotamento) confirma os nomes dos instaladores. Quando os
 * arquivos estiverem publicados em GitHub Releases:
 *   1. confira/ajuste os nomes em `INSTALLERS`;
 *   2. preencha os `sha256` de cada instalador;
 *   3. troque `RELEASE_PUBLISHED` para `true`.
 */

export const REPO_URL = "https://github.com/Paccanaro18/mergedev";
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const RELEASES_DOWNLOAD_BASE = `${REPO_URL}/releases/latest/download`;

/**
 * Enquanto for `false` (nenhum instalador publicado), os links diretos
 * `…/download/<arquivo>` dariam 404. Nesse estado todo botão aponta para
 * `RELEASES_URL` e a página mostra "em breve".
 */
export const RELEASE_PUBLISHED = false;

export type OsId = "windows" | "macos" | "linux";

export interface Installer {
  id: OsId;
  /** Nome do sistema como aparece na página. */
  label: string;
  /** Nome fixo do arquivo, sem versão. */
  file: string;
  /** Hash SHA-256 do arquivo da release (hex). `null` enquanto não publicado. */
  sha256: string | null;
  /** Comando para conferir o hash no sistema. */
  verifyCommand: string;
}

export const INSTALLERS: readonly Installer[] = [
  {
    id: "windows",
    label: "Windows",
    file: "Merge-Setup.exe",
    sha256: null,
    verifyCommand: "certutil -hashfile Merge-Setup.exe SHA256",
  },
  {
    id: "macos",
    label: "macOS",
    file: "Merge.dmg",
    sha256: null,
    verifyCommand: "shasum -a 256 Merge.dmg",
  },
  {
    id: "linux",
    label: "Linux",
    file: "Merge.AppImage",
    sha256: null,
    verifyCommand: "sha256sum Merge.AppImage",
  },
];

/** Link que o botão de cada sistema deve usar agora. */
export function downloadHref(installer: Installer): string {
  return RELEASE_PUBLISHED
    ? `${RELEASES_DOWNLOAD_BASE}/${installer.file}`
    : RELEASES_URL;
}

export interface Agent {
  name: string;
  /** Agentes ativos ganham destaque; os demais aparecem como "em breve". */
  status: "available" | "soon";
}

export const AGENTS: readonly Agent[] = [
  { name: "Claude Code", status: "available" },
  { name: "Codex", status: "available" },
];
