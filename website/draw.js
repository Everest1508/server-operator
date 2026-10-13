/* Draw doodles on first scroll into view; skipped under reduced motion. */
(function () {
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
