import { ipcMain } from "electron";
import type { PermissionMode, ProviderSettings, Store } from "@merge/core";
import { Channels } from "../shared/api";

const MODES: PermissionMode[] = ["default", "acceptEdits", "plan", "bypassPermissions"];

/** Validates what came from the renderer. Empty fields are dropped, so they clear the saved value. */
export function parseSettings(raw: unknown): ProviderSettings {
  if (typeof raw !== "object" || raw === null) throw new Error("Configurações inválidas.");
  const input = raw as Record<string, unknown>;
  const settings: ProviderSettings = {};

  if (input.permissionMode !== undefined && input.permissionMode !== null) {
    if (!MODES.includes(input.permissionMode as PermissionMode)) {
      throw new Error(`Modo de permissão inválido: ${String(input.permissionMode)}`);
    }
    settings.permissionMode = input.permissionMode as PermissionMode;
  }
  if (input.allowedTools !== undefined && input.allowedTools !== null) {
    if (!Array.isArray(input.allowedTools) || input.allowedTools.some((t) => typeof t !== "string")) {
      throw new Error("A lista de ferramentas permitidas deve conter apenas textos.");
    }
    const tools = (input.allowedTools as string[]).map((t) => t.trim()).filter(Boolean);
    if (tools.length) settings.allowedTools = tools;
  }
  if (input.command !== undefined && input.command !== null) {
    if (typeof input.command !== "string") throw new Error("O caminho do binário deve ser um texto.");
    const command = input.command.trim();
    if (command) settings.command = command;
  }
  return settings;
}

export function registerSettingsIpc(store: Store, providerIds: () => string[]): void {
  const check = (providerId: string, projectId?: string) => {
    if (!providerIds().includes(providerId)) throw new Error(`Provider desconhecido: ${providerId}`);
    if (projectId !== undefined && !store.getProject(projectId)) throw new Error("Projeto não encontrado.");
  };

  ipcMain.handle(Channels.settingsGet, (_e, providerId: string, projectId?: string) => {
    check(providerId, projectId);
    return store.getProviderSettings(providerId, projectId);
  });
  ipcMain.handle(Channels.settingsResolve, (_e, providerId: string, projectId: string) => {
    check(providerId, projectId);
    return store.resolveProviderSettings(providerId, projectId);
  });
  ipcMain.handle(
    Channels.settingsSet,
    (_e, providerId: string, settings: unknown, projectId?: string) => {
      check(providerId, projectId);
      store.setProviderSettings(providerId, parseSettings(settings), projectId);
    },
  );
}
