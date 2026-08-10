// Jonathan & Associados — interações da página
// Mantido simples e comentado: cada bloco cuida de uma única responsabilidade.

document.addEventListener("DOMContentLoaded", () => {
  setFooterYear();
  setupHeaderScrollState();
  setupMobileNav();
  setupScrollReveal();
  setupSmoothAnchorLinks();
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
