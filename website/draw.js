/* Draw doodles on first scroll into view; skipped under reduced motion. */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelectorAll('.pkt').forEach((p) => p.remove());
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.25 });
  document.querySelectorAll('svg.doodle, svg.icon').forEach((svg) => {
    svg.querySelectorAll('path,rect,circle,text').forEach((el, i) => {
      el.setAttribute('pathLength', '1');
      el.style.setProperty('--d', Math.min(i * 0.07, 1.4) + 's');
    });
    svg.classList.add('draw');
    io.observe(svg);
  });
})();

/* Motion layer: reveal on scroll, scroll progress bar, nav scroll-spy. */
(function () {
  const nav = document.querySelector('.site-nav');
  const bar = document.createElement('div');
  bar.id = 'progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? scrollY / h : 0) + ')';
      if (nav) nav.classList.toggle('scrolled', scrollY > 8);
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // scroll-spy: highlight the nav link of the section in view
  const links = [...document.querySelectorAll('.site-nav__links a[href^="#"]')];
  if (links.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((a) => { const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) spy.observe(t); });
  }

  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  const sel = '.section__title, .section__subtitle, .feature-card, .download-card, .release-card, .code-block, .tech-list li, .download-note';
  document.querySelectorAll(sel).forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight) return; // already on screen: no flash
    const sib = [...el.parentElement.children].indexOf(el);
    el.style.setProperty('--rd', Math.min(sib * 0.06, 0.4) + 's');
    el.classList.add('reveal');
    io.observe(el);
  });
})();

/* Pause live hero animation (SMIL packets, CSS blinks) while it is off-screen. */
(function () {
  if (!('IntersectionObserver' in window)) return;
  const live = document.querySelectorAll('svg.doodle');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const svg = e.target;
      if (!svg.querySelector('.pkt, .led, .cur')) return;
      svg.classList.toggle('paused', !e.isIntersecting);
      if (svg.pauseAnimations) e.isIntersecting ? svg.unpauseAnimations() : svg.pauseAnimations();
    });
  });
  live.forEach((s) => io.observe(s));
})();
