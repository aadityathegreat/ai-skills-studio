'use strict';
// Progressive enhancement: all projects remain visible without JavaScript.
const filters = document.querySelector('.filters');
if (filters) {
  const buttons = [...filters.querySelectorAll('button')];
  const projects = [...document.querySelectorAll('.project')];
  const status = document.getElementById('filter-status');
  filters.hidden = false;
  filters.addEventListener('click', event => {
    const button = event.target.closest('button[data-filter]');
    if (!button || !filters.contains(button)) return;
    const category = button.dataset.filter;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    projects.forEach(project => {
      project.hidden = category !== 'all' && project.dataset.category !== category;
    });
    const count = projects.filter(project => !project.hidden).length;
    status.textContent = `${count} ${count === 1 ? 'project' : 'projects'} shown. ${button.textContent}.`;
  });
}
