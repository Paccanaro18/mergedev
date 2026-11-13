/**
 * Camada de movimento (melhoria progressiva). Sem este script a página
 * continua completa; aqui ligamos o que CSS sozinho não faz:
 *  - cards que entram em sequência ao rolar (reveal);
 *  - luz que segue o cursor (hero e cards);
 *  - pausa das animações que estão fora da tela;
 *  - botão "Pausar animações" (WCAG 2.2.2) e respeito a prefers-reduced-motion.
 *
 * Desempenho: NADA é escrito no <html> durante a rolagem (mudar uma variável
 * CSS na raiz invalida o estilo da página inteira e trava a rolagem). Os
 * únicos writes em movimento são `transform` de um elemento pequeno (luz do
 * hero) e variáveis no card sob o cursor. Só usa o CSSOM, então roda sob CSP
 * estrita sem 'unsafe-inline'.
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

/* ---------- Pausa a decoração pesada enquanto rola ---------- */

// Atributo no <body> (e não no <html>) e só quando o estado muda: custa
// uma invalidação mínima, ao contrário de escrever variáveis na raiz a cada frame.
let scrolling = false;
let scrollTimer = 0;

window.addEventListener(
  "scroll",
  () => {
    if (!scrolling) {
      scrolling = true;
      document.body.setAttribute("data-scrolling", "");
    }
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      scrolling = false;
      document.body.removeAttribute("data-scrolling");
    }, 160);
  },
  { passive: true },
);

/* ---------- Pausa o que está fora da tela ---------- */

const liveObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      (entry.target as HTMLElement).toggleAttribute("data-offscreen", !entry.isIntersecting);
    }
  },
  { rootMargin: "80px 0px 80px 0px" },
);
document.querySelectorAll<HTMLElement>("[data-live]").forEach((el) => liveObserver.observe(el));

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
const glow = document.querySelector<HTMLElement>("[data-hero-glow]");
let pointer: { x: number; y: number; target: EventTarget | null } | null = null;
let pointerTicking = false;

function paintPointer(): void {
  pointerTicking = false;
  if (!pointer || !motionOn) return;
  const { x, y, target } = pointer;

  if (target instanceof Element) {
    const card = target.closest<HTMLElement>(".feature, .step");
    if (card) {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${Math.round(x - rect.left)}px`);
      card.style.setProperty("--my", `${Math.round(y - rect.top)}px`);
    }
  }

  if (hero && glow) {
    const rect = hero.getBoundingClientRect();
    const inside = y >= rect.top && y <= rect.bottom;
    glow.classList.toggle("is-on", inside);
    if (inside) glow.style.transform = `translate3d(${Math.round(x - rect.left)}px, ${Math.round(y - rect.top)}px, 0)`;
  }
}

document.addEventListener(
  "pointermove",
  (event) => {
    if (!motionOn || !canHover.matches) return;
    pointer = { x: event.clientX, y: event.clientY, target: event.target };
    if (!pointerTicking) {
      pointerTicking = true;
      requestAnimationFrame(paintPointer);
    }
  },
  { passive: true },
);
document.addEventListener("pointerleave", () => glow?.classList.remove("is-on"));

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
  else {
    stopReveal();
    glow?.classList.remove("is-on");
  }
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
