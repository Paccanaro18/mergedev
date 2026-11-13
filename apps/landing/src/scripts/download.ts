import { detectOs } from "./detect-os";

/**
 * Melhoria progressiva: sem JS o botão leva à página de releases. Com JS,
 * detectamos o sistema, apontamos o botão principal para o instalador certo e
 * escondemos esse sistema da lista "outros sistemas".
 *
 * Os links e rótulos vêm do HTML (gerado a partir de src/config.ts); aqui só
 * copiamos do item do sistema detectado para o botão principal.
 */
const os = detectOs(navigator);

if (os) {
  document.querySelectorAll<HTMLElement>("[data-download]").forEach((root) => {
    const primary = root.querySelector<HTMLAnchorElement>("[data-download-primary]");
    const label = root.querySelector<HTMLElement>("[data-download-label]");
    const match = root.querySelector<HTMLAnchorElement>(`[data-os-link="${os}"]`);
    if (!primary || !label || !match) return;

    primary.href = match.href;
    label.textContent = match.dataset.primaryLabel ?? label.textContent;
    primary.dataset.os = os;

    // O sistema detectado sai da lista "outros" só quando o botão principal
    // já é o link direto (com release publicada).
    if (root.dataset.published === "true") {
      root
        .querySelectorAll<HTMLElement>(`[data-os-item="${os}"]`)
        .forEach((item) => {
          item.hidden = true;
        });
    }
  });
}
