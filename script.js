// Nav scroll state
const nav = document.getElementById("nav");
window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 40);
}, { passive: true });

// Mobile menu
const burger = document.getElementById("navBurger");
const mobileNav = document.getElementById("mobileNav");
burger.addEventListener("click", () => {
  burger.classList.toggle("open");
  mobileNav.classList.toggle("open");
  document.body.style.overflow = mobileNav.classList.contains("open") ? "hidden" : "";
});
mobileNav.querySelectorAll("a").forEach((a) => {
  a.addEventListener("click", () => {
    burger.classList.remove("open");
    mobileNav.classList.remove("open");
    document.body.style.overflow = "";
  });
});

// Reveal on scroll
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      revealObs.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((el) => revealObs.observe(el));

// Hero stats bar reveal
const statsEl = document.getElementById("stats");
if (statsEl) {
  const statsObs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        statsEl.classList.add("visible");
        statsObs.unobserve(statsEl);
      }
    });
  }, { threshold: 0.3 });
  statsObs.observe(statsEl);
}

// Process: four stages on one pinned screen, advanced by scrolling through it.
// The section is taller than the viewport; how far into it you have scrolled
// decides which card is open and which illustration is showing.
const processSection = document.getElementById("process");
if (processSection) {
  const shots = [...processSection.querySelectorAll(".process-shot")];
  const cards = [...processSection.querySelectorAll(".pcard")];
  const steps = Math.min(shots.length, cards.length);
  const pinned = window.matchMedia("(min-width: 961px)");
  let current = 0;

  const show = (next) => {
    if (next === current) return;
    shots.forEach((shot, i) => {
      shot.classList.toggle("is-active", i === next);
      shot.classList.toggle("is-past", i !== next && i <= next);
    });
    cards.forEach((card, i) => {
      card.classList.toggle("is-active", i === next);
      card.querySelector(".pcard-head").setAttribute("aria-expanded", i === next ? "true" : "false");
    });
    current = next;
  };

  // Scroll distance the section has beyond one screen: the travel the stages use.
  const travel = () => processSection.offsetHeight - window.innerHeight;

  const sync = () => {
    if (!pinned.matches) return;
    const span = travel();
    if (span <= 0) return;
    const progress = Math.min(Math.max(-processSection.getBoundingClientRect().top / span, 0), 1);
    const raw = progress * steps;
    let next = Math.min(steps - 1, Math.floor(raw));
    // A small dead zone around each threshold, so a stray trackpad nudge on a
    // boundary does not flip back and forth between two stages.
    if (next !== current && Math.abs(raw - Math.max(next, current)) < 0.06) next = current;
    show(next);
  };

  let queued = false;
  window.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sync(); });
  }, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
  sync();

  // Clicking a card is a shortcut: scroll to the middle of that stage's range,
  // which then opens it through the same path as scrolling.
  cards.forEach((card, i) => {
    card.querySelector(".pcard-head").addEventListener("click", () => {
      if (!pinned.matches) { show(i); return; }
      const span = travel();
      if (span <= 0) { show(i); return; }
      window.scrollTo({
        top: processSection.offsetTop + span * ((i + 0.5) / steps),
        behavior: "smooth",
      });
    });
  });
}
