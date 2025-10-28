// assets/site.js

(function(){
  const btn = document.getElementById('menuBtn');
  const drawer = document.getElementById('drawer');
  if(!btn || !drawer) return;

  // toggle open/close
  btn.addEventListener('click', () => {
    const opened = drawer.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(opened));
    drawer.setAttribute('aria-hidden', String(!opened));
  });

  // click outside to close
  document.addEventListener('click', (e) => {
    if(!drawer.classList.contains('open')) return;
    const within = drawer.contains(e.target) || btn.contains(e.target);
    if(!within){
      drawer.classList.remove('open');
      btn.setAttribute('aria-expanded','false');
      drawer.setAttribute('aria-hidden','true');
    }
  });
})();
