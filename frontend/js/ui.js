// AXON — ui.js
// Chrome/interaction layer: drawers, panel collapse, map expand, mode toggle.
// Holds no domain state — reads/writes only through State and the modules
// that own each domain.

import { invalidateSize } from './map.js';

export function initDrawers() {
  document.querySelectorAll('[data-drawer-target]').forEach((btn) => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.drawerTarget));
  });
  document.querySelectorAll('[data-drawer-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeDrawer(btn.closest('.drawer').id));
  });
  document.getElementById('drawer-backdrop')?.addEventListener('click', closeAllDrawers);
}

export function openDrawer(id) {
  closeAllDrawers();
  const drawer = document.getElementById(id);
  if (!drawer) return;
  drawer.classList.add('drawer--open');
  document.getElementById('drawer-backdrop')?.classList.add('backdrop--visible');
}

export function closeDrawer(id) {
  document.getElementById(id)?.classList.remove('drawer--open');
  document.getElementById('drawer-backdrop')?.classList.remove('backdrop--visible');
}

export function closeAllDrawers() {
  document.querySelectorAll('.drawer--open').forEach((d) => d.classList.remove('drawer--open'));
  document.getElementById('drawer-backdrop')?.classList.remove('backdrop--visible');
}

export function initExpandMap() {
  const btn = document.getElementById('btn-expand-map');
  const shell = document.querySelector('.command-shell');
  btn?.addEventListener('click', () => {
    shell.classList.toggle('command-shell--map-expanded');
    btn.textContent = shell.classList.contains('command-shell--map-expanded') ? 'COLLAPSE MAP' : 'EXPAND MAP';
    invalidateSize();
  });
}

export function initFullscreen() {
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
}

export function initModeToggle(onModeChange) {
  const liveBtn = document.getElementById('mode-live');
  const twinBtn = document.getElementById('mode-twin');
  liveBtn?.addEventListener('click', () => {
    liveBtn.classList.add('mode-btn--active');
    twinBtn.classList.remove('mode-btn--active');
    document.getElementById('twin-control-panel')?.classList.remove('twin-panel--open');
    onModeChange('LIVE');
  });
  twinBtn?.addEventListener('click', () => {
    twinBtn.classList.add('mode-btn--active');
    liveBtn.classList.remove('mode-btn--active');
    document.getElementById('twin-control-panel')?.classList.add('twin-panel--open');
    onModeChange('TWIN');
  });
}

export function initResponsivePanels() {
  const mq = window.matchMedia('(max-width: 1440px)');
  const shell = document.querySelector('.command-shell');
  function apply() {
    shell.classList.toggle('command-shell--compact', mq.matches);
  }
  mq.addEventListener('change', apply);
  apply();
}

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

export function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
