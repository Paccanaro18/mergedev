export type DetectedOs = "windows" | "macos" | "linux";

interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string };
}

/**
 * Detecta o sistema desktop do visitante. Retorna `null` quando não dá para ter
 * certeza ou quando é um dispositivo móvel (não há instalador para eles).
 */
export function detectOs(nav: NavigatorLike): DetectedOs | null {
  const ua = nav.userAgent ?? "";

  // Celulares e tablets: o Merge é um app de desktop.
  if (/android|iphone|ipad|ipod|cros/i.test(ua)) return null;

  const platform = `${nav.userAgentData?.platform ?? ""} ${nav.platform ?? ""}`;
  const haystack = `${platform} ${ua}`;

  // iPadOS 13+ se identifica como Mac, mas tem tela de toque.
  if (/mac/i.test(haystack) && (nav.maxTouchPoints ?? 0) > 1) return null;

  if (/\bwin/i.test(platform) || /windows/i.test(ua)) return "windows";
  if (/mac/i.test(haystack)) return "macos";
  if (/linux|x11/i.test(haystack)) return "linux";
  return null;
}
