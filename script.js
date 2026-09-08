// Jonathan & Associados — interações da página
// Mantido simples e comentado: cada bloco cuida de uma única responsabilidade.

document.addEventListener("DOMContentLoaded", () => {
  setFooterYear();
  setupHeaderScrollState();
  setupMobileNav();
  setupScrollReveal();
  setupSmoothAnchorLinks();
  setupReelsSection();
});

// Atualiza o ano no rodapé automaticamente, sem precisar editar todo ano.
function setFooterYear() {
  const yearEl = document.getElementById("ano");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// O cabeçalho começa transparente sobre a foto do hero e ganha fundo sólido
// assim que a pessoa rola a página, para o texto do menu continuar legível.
function setupHeaderScrollState() {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const applyState = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 40);
  };

  applyState();
  window.addEventListener("scroll", applyState, { passive: true });
}

// Menu hambúrguer em telas estreitas. Fecha automaticamente ao clicar
// num link, para não deixar o menu aberto por cima do conteúdo.
function setupMobileNav() {
  const toggle = document.getElementById("navToggle");
  const menu = document.getElementById("navMenu");
  if (!toggle || !menu) return;

  const closeMenu = () => {
    menu.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  // Fecha o menu se a pessoa aumentar a janela e o menu deixar de ser necessário.
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMenu();
  });
}

// Revela elementos suavemente conforme entram na tela (cards, textos,
// o diagrama-assinatura). Verifica prefers-reduced-motion antes de animar,
// respeitando quem prefere menos movimento na tela.
function setupScrollReveal() {
  const targets = document.querySelectorAll(".reveal, .signature-diagram");
  observeReveal(targets);
}

// Helper reaproveitado pelo scroll reveal inicial e por elementos inseridos
// dinamicamente depois (como a seção de reels), que não existem ainda no
// momento do DOMContentLoaded.
function observeReveal(targets) {
  if (!targets.length) return;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2, rootMargin: "0px 0px -60px 0px" }
  );

  targets.forEach((el) => observer.observe(el));
}

// Rolagem suave para os links do menu que apontam para âncoras da própria
// página, considerando a altura do cabeçalho fixo para não cortar o título.
function setupSmoothAnchorLinks() {
  const header = document.querySelector(".site-header");
  const links = document.querySelectorAll('a[href^="#"]:not([href="#"])');

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) return;

      event.preventDefault();
      const headerHeight = header ? header.offsetHeight : 0;
      const top =
        target.getBoundingClientRect().top + window.scrollY - headerHeight - 16;

      window.scrollTo({ top, behavior: "smooth" });
    });
  });
}

// Busca os reels mais recentes (reels.json, gerado pelo GitHub Actions a
// partir da API do Instagram) e monta uma seção nova entre "Equipe" e
// "Contato" — o HTML original não é tocado, a seção é montada em runtime.
async function setupReelsSection() {
  try {
    const response = await fetch("./reels.json", { cache: "no-store" });
    if (!response.ok) return;

    const reels = await response.json();
    if (!Array.isArray(reels) || reels.length === 0) return;

    const section = buildReelsSection(reels);
    const contato = document.getElementById("contato");
    const main = document.getElementById("conteudo");

    if (contato && main) {
      main.insertBefore(section, contato);
    } else {
      main?.appendChild(section);
    }

    observeReveal(section.querySelectorAll(".reveal"));
    loadInstagramEmbedScript();
  } catch (error) {
    // Falha silenciosa: se o Instagram estiver fora do ar ou o arquivo
    // ainda não existir, a página segue funcionando normalmente sem a seção.
    console.warn("Não foi possível carregar os reels:", error);
  }
}

function buildReelsSection(reels) {
  const section = document.createElement("section");
  section.className = "section section--ivory reels-section";
  section.id = "reels";

  const wrap = document.createElement("div");
  wrap.className = "wrap reels-wrap";

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "No Instagram";

  const title = document.createElement("h2");
  title.className = "section-title reveal";
  title.innerHTML = "Conteúdo recente, <em>direto do Instagram</em>";

  const grid = document.createElement("div");
  grid.className = "reels-grid";

  reels.forEach((reel) => {
    const card = document.createElement("div");
    card.className = "reel-card reveal";

    const blockquote = document.createElement("blockquote");
    blockquote.className = "instagram-media";
    blockquote.setAttribute("data-instgrm-permalink", reel.permalink);
    blockquote.setAttribute("data-instgrm-version", "14");

    card.appendChild(blockquote);
    grid.appendChild(card);
  });

  wrap.append(eyebrow, title, grid);
  section.appendChild(wrap);
  return section;
}

// Carrega o script oficial de embed do Instagram uma única vez. Se os
// blockquotes forem inseridos depois que o script já rodou, chama
// window.instgrm.Embeds.process() para processar os novos.
function loadInstagramEmbedScript() {
  if (window.instgrm) {
    window.instgrm.Embeds.process();
    return;
  }

  const existing = document.querySelector(
    'script[src*="instagram.com/embed.js"]'
  );
  if (existing) return;

  const script = document.createElement("script");
  script.src = "https://www.instagram.com/embed.js";
  script.async = true;
  document.body.appendChild(script);
}
