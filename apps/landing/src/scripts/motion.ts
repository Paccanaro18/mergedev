/**
 * Camada de movimento (melhoria progressiva). Sem este script a página
 * continua completa; aqui ligamos o que CSS sozinho não faz:
 *  - header fixo com barra de progresso e destaque da seção atual;
 *  - cards que entram em sequência ao rolar (reveal);
 *  - parallax do fundo, luz que segue o cursor (hero e cards);
 *  - botão "Pausar animações" (WCAG 2.2.2) e respeito a prefers-reduced-motion.
 *
 * Só manipula o CSSOM (`style.setProperty`, classes e atributos), então roda
 * sob CSP estrita sem 'unsafe-inline'.
 */

type MotionPref = "on" | "off";

const root = document.documentElement;
const STORAGE_KEY = "merge-motion";
const reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");
const canHover = matchMedia("(hover: hover) and (pointer: fine)");

function readPref(): MotionPref | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

function savePref(value: MotionPref): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // armazenamento bloqueado: a preferência vale só nesta visita
  }
}

let motionOn = (readPref() ?? (reduceQuery.matches ? "off" : "on")) === "on";

/* ---------- Scroll: progresso, header e parallax ---------- */

const header = document.querySelector<HTMLElement>("[data-header]");
let scrollTicking = false;

function updateScroll(): void {
  scrollTicking = false;
  const y = window.scrollY;
  const max = root.scrollHeight - window.innerHeight;
  root.style.setProperty("--progress", String(max > 0 ? Math.min(1, y / max) : 0));
  root.style.setProperty("--sy", motionOn ? String(Math.round(y)) : "0");
  header?.toggleAttribute("data-scrolled", y > 8);
}

function onScroll(): void {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(updateScroll);
}

window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll, { passive: true });

/* ---------- Seção atual no menu ---------- */

const spyLinks = new Map<string, HTMLAnchorElement>();
document.querySelectorAll<HTMLAnchorElement>("[data-spy]").forEach((link) => {
  if (link.dataset.spy) spyLinks.set(link.dataset.spy, link);
});

if (spyLinks.size > 0) {
  let current: string | null = null;
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = entry.target.id;
        if (entry.isIntersecting) current = id;
        else if (current === id) current = null;
      }
      spyLinks.forEach((link, id) => {
        if (id === current) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  spyLinks.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) spy.observe(section);
  });
}

/* ---------- Reveal ao rolar ---------- */

let revealObserver: IntersectionObserver | null = null;

function startReveal(): void {
  if (revealObserver) return;

  document.querySelectorAll<HTMLElement>("[data-stagger]").forEach((group) => {
    Array.from(group.children).forEach((child, index) => {
      (child as HTMLElement).style.setProperty("--i", String(index));
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.classList.remove("reveal-pending");
        observer.unobserve(el);
        window.setTimeout(() => el.style.removeProperty("--i"), 1800);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
  );
  revealObserver = observer;

  document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
    const rect = el.getBoundingClientRect();
    const inView = rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
    if (inView) {
      el.style.removeProperty("--i");
      return;
    }
    el.classList.add("reveal-pending");
    observer.observe(el);
  });
}

function stopReveal(): void {
  revealObserver?.disconnect();
  revealObserver = null;
  document.querySelectorAll<HTMLElement>(".reveal-pending").forEach((el) => {
    el.classList.remove("reveal-pending");
  });
}

/* ---------- Luz que segue o cursor ---------- */

const hero = document.querySelector<HTMLElement>("[data-hero]");

function onPointerMove(event: PointerEvent): void {
  if (!motionOn || !canHover.matches) return;
  const target = event.target;
  if (!(target instanceof Element)) return;

  const card = target.closest<HTMLElement>(".feature, .step");
  if (card) {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${Math.round(event.clientX - rect.left)}px`);
    card.style.setProperty("--my", `${Math.round(event.clientY - rect.top)}px`);
  }

  if (hero) {
    const rect = hero.getBoundingClientRect();
    const inside = event.clientY >= rect.top && event.clientY <= rect.bottom;
    hero.style.setProperty("--hglow", inside ? "1" : "0");
    if (inside) {
      hero.style.setProperty("--hx", `${Math.round(event.clientX - rect.left)}px`);
      hero.style.setProperty("--hy", `${Math.round(event.clientY - rect.top)}px`);
    }
  }
}

document.addEventListener("pointermove", onPointerMove, { passive: true });
document.addEventListener("pointerleave", () => hero?.style.setProperty("--hglow", "0"));

/* ---------- Botão "Pausar animações" ---------- */

const toggle = document.querySelector<HTMLButtonElement>("[data-motion-toggle]");
const toggleLabel = document.querySelector<HTMLElement>("[data-motion-toggle-label]");

function applyMotion(): void {
  root.dataset.motion = motionOn ? "on" : "off";
  if (toggle && toggleLabel) {
    toggleLabel.textContent = motionOn ? "Pausar animações" : "Retomar animações";
    toggle.dataset.state = motionOn ? "playing" : "paused";
  }
  if (motionOn) startReveal();
  else stopReveal();
  updateScroll();
}

if (toggle) {
  toggle.hidden = false;
  toggle.addEventListener("click", () => {
    motionOn = !motionOn;
    savePref(motionOn ? "on" : "off");
    applyMotion();
  });
}

reduceQuery.addEventListener("change", () => {
  if (readPref() !== null) return; // escolha explícita do visitante vale mais
  motionOn = !reduceQuery.matches;
  applyMotion();
});

applyMotion();
