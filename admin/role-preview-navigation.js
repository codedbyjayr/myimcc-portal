document.addEventListener('click', event => {
  const button = event.target.closest('[data-page],[data-view]');
  if (button) {
    const name = button.dataset.page || button.dataset.view;
    const target = document.getElementById('page-' + name) || document.getElementById('view-' + name);
    if (!target) return;
    document.querySelectorAll('.page,[id^="view-"]').forEach(el => {
      el.classList.toggle('active', el === target);
      el.classList.toggle('hidden', el !== target);
      el.hidden = el !== target;
    });
    document.querySelectorAll('[data-page],[data-view]').forEach(el => el.classList.toggle('active', el === button));
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = button.textContent.trim();
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
  }
  if (event.target.closest('#menuToggle')) {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebarOverlay')?.classList.toggle('active');
  }
  if (event.target.closest('#sidebarCloseBtn,#sidebarOverlay')) {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
  }
});
