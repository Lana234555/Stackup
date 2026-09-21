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

// Services carousel: flip cards forward-only with the mouse wheel or drag,
// without scrolling the page away from the section title
const srvGrid = document.querySelector(".srv-grid");
if (srvGrid) {
  srvGrid.addEventListener("wheel", (e) => {
    const primary = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (primary < 0) return; // never flip the fan backward (left) with the wheel
    const atEnd = srvGrid.scrollLeft + srvGrid.clientWidth >= srvGrid.scrollWidth - 1;
    if (atEnd) return;
    e.preventDefault();
    srvGrid.scrollLeft += primary;
  }, { passive: false });

  let isDown = false, startX = 0, startScroll = 0;
  srvGrid.addEventListener("mousedown", (e) => {
    isDown = true;
    srvGrid.classList.add("dragging");
    startX = e.pageX;
    startScroll = srvGrid.scrollLeft;
  });
  window.addEventListener("mouseup", () => {
    isDown = false;
    srvGrid.classList.remove("dragging");
  });
  srvGrid.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const next = startScroll - (e.pageX - startX);
    srvGrid.scrollLeft = Math.max(next, startScroll); // forward only, no dragging back left
  });
}

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
