/**
 * ui.js
 * -----
 * Qué hace: agrupa TODA la manipulación de DOM reutilizable entre páginas:
 * sidebar desplegable, loaders, banners de error, tarjetas, badges, modal de
 * sesión expirada y el panel de pruebas de resiliencia.
 * Por qué existe: requisito #8 (todo el DOM se construye dinámicamente,
 * nunca con HTML estático) y #9 (funciones pequeñas, responsabilidad clara).
 * Problema que resuelve: evita repetir innerHTML idéntico en 5 páginas.
 */

import { clearSession } from './auth.js';
import { formatCacheAge } from './cache.js';

/* ------------------------------------------------------------------ */
/* SIDEBAR (ventana desplegable del lado izquierdo)                    */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { href: 'dashboard.html', label: 'Inicio', icon: '🏠' },
  { href: 'matches.html', label: 'Partidos', icon: '⚽' },
  { href: 'teams.html', label: 'Equipos', icon: '👥' },
  { href: 'groups.html', label: 'Grupos', icon: '📊' },
  { href: 'stadiums.html', label: 'Estadios', icon: '🏟️' },
];

/**
 * Construye el sidebar y lo inserta en #app-sidebar. Cada botón es un <a>
 * a una página HTML distinta (navegación real, no SPA), tal como se pidió.
 * @param {string} activePage - nombre de archivo de la página actual
 */
export function renderSidebar(activePage) {
  const container = document.getElementById('app-sidebar');
  if (!container) return;

  const session = JSON.parse(localStorage.getItem('wc26_session') || 'null');
  const userName = session?.user?.name || 'Invitado';

  container.innerHTML = '';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'sidebar-toggle';
  toggleBtn.setAttribute('aria-label', 'Mostrar u ocultar menú');
  toggleBtn.textContent = '☰';
  toggleBtn.addEventListener('click', () => {
    container.classList.toggle('sidebar--collapsed');
    document.querySelector('.app-shell')?.classList.toggle('sidebar--collapsed-layout');
  });

  const brand = document.createElement('div');
  brand.className = 'sidebar-brand';
  brand.innerHTML = '<span class="sidebar-brand__mark">WC</span><span class="sidebar-brand__text">Mundial 2026</span>';

  const nav = document.createElement('nav');
  nav.className = 'sidebar-nav';
  nav.setAttribute('aria-label', 'Navegación principal');

  NAV_ITEMS.forEach((item) => {
    const link = document.createElement('a');
    link.href = item.href;
    link.className = 'sidebar-nav__item' + (item.href === activePage ? ' sidebar-nav__item--active' : '');
    link.innerHTML = `<span class="sidebar-nav__icon" aria-hidden="true">${item.icon}</span><span class="sidebar-nav__label">${item.label}</span>`;
    nav.appendChild(link);
  });

  const footer = document.createElement('div');
  footer.className = 'sidebar-footer';
  footer.innerHTML = `<div class="sidebar-user"><span class="sidebar-user__dot" aria-hidden="true"></span><span>${escapeHtml(userName)}</span></div>`;

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'sidebar-logout';
  logoutBtn.type = 'button';
  logoutBtn.textContent = 'Cerrar sesión';
  logoutBtn.addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });
  footer.appendChild(logoutBtn);

  container.append(toggleBtn, brand, nav, footer);
}

/* ------------------------------------------------------------------ */
/* ESTADOS DE CARGA / ERROR / VACÍO                                     */
/* ------------------------------------------------------------------ */

/** Pinta un loader (spinner + texto) dentro de un contenedor. */
export function renderLoader(container, text = 'Cargando datos...') {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'state state--loading';
  wrap.setAttribute('role', 'status');
  wrap.innerHTML = `<span class="spinner" aria-hidden="true"></span><p>${escapeHtml(text)}</p>`;
  container.appendChild(wrap);
}

/** Pinta un estado vacío (sin datos, sin error). */
export function renderEmptyState(container, text = 'No hay información disponible todavía.') {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'state state--empty';
  wrap.innerHTML = `<span aria-hidden="true">📭</span><p>${escapeHtml(text)}</p>`;
  container.appendChild(wrap);
}

/**
 * Pinta un banner de error NO bloqueante dentro de una sección específica,
 * sin afectar el resto de la página (requisito #7: fallos independientes).
 */
export function renderErrorBanner(container, message) {
  const wrap = document.createElement('div');
  wrap.className = 'banner banner--error';
  wrap.setAttribute('role', 'alert');
  wrap.innerHTML = `<span aria-hidden="true">⚠️</span><span>${escapeHtml(message)}</span>`;
  container.prepend(wrap);
}

/**
 * Aviso de "estos son datos cacheados" que se antepone a una sección,
 * sin ocultar los datos (requisito #6).
 */
export function renderCacheBanner(container, timestamp) {
  const wrap = document.createElement('div');
  wrap.className = 'banner banner--cache';
  wrap.innerHTML = `<span aria-hidden="true">🕒</span><span>Mostrando datos guardados (${formatCacheAge(timestamp)}). Pueden no estar actualizados.</span>`;
  container.prepend(wrap);
}

/** Contador visible para el backoff del 429, requerido explícitamente. */
export function createRetryCounter(container) {
  const el = document.createElement('p');
  el.className = 'retry-counter';
  el.hidden = true;
  container.prepend(el);
  return el;
}

/* ------------------------------------------------------------------ */
/* MODAL DE SESIÓN EXPIRADA (requisito #4)                              */
/* ------------------------------------------------------------------ */

/**
 * Muestra el modal de "Sesión expirada". No usa window.location.reload()
 * ni ningún equivalente: el botón navega con un <a href="index.html">.
 */
export function showSessionExpiredModal() {
  if (document.getElementById('session-expired-modal')) return; // evita duplicados

  const overlay = document.createElement('div');
  overlay.id = 'session-expired-modal';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'session-expired-title');

  overlay.innerHTML = `
    <div class="modal">
      <h2 id="session-expired-title">Sesión expirada</h2>
      <p>Tu token de acceso ya no es válido. Por favor, vuelve a autenticarte para continuar.</p>
      <a class="btn btn--primary" href="index.html">Volver a iniciar sesión</a>
    </div>
  `;
  document.body.appendChild(overlay);
}

/**
 * Manejador de errores estándar para usar en el catch de cualquier página.
 * Si el error es 401, muestra el modal bloqueante de sesión expirada
 * (requisito #4). Para cualquier otro código, pinta un banner de error
 * localizado en el contenedor recibido, sin afectar el resto de la página.
 */
export function handleApiError(err, container) {
  if (err.status === 401) {
    showSessionExpiredModal();
    return;
  }
  if (container) renderErrorBanner(container, err.message);
}

/* ------------------------------------------------------------------ */
/* TARJETAS Y BADGES REUTILIZABLES                                     */
/* ------------------------------------------------------------------ */

export function createBadge(text, variant = 'neutral') {
  const span = document.createElement('span');
  span.className = `badge badge--${variant}`;
  span.textContent = text;
  return span;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

/* ------------------------------------------------------------------ */
/* PANEL DE PRUEBAS DE RESILIENCIA (solo en dashboard.html)             */
/* ------------------------------------------------------------------ */

/**
 * Construye el panel que permite forzar cada código de error para la
 * defensa oral. Ver la nota de honestidad académica en api.js.
 */
export function renderResiliencePanel(container, onForce) {
  const codes = [400, 401, 403, 404, 429, 500, 503, 'network', 'timeout'];
  const wrap = document.createElement('div');
  wrap.className = 'resilience-panel';
  wrap.innerHTML = '<h3>Panel de pruebas de resiliencia</h3><p>Fuerza cada escenario para la próxima consulta y comprueba cómo responde la interfaz.</p>';

  const grid = document.createElement('div');
  grid.className = 'resilience-panel__grid';
  codes.forEach((code) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost';
    btn.textContent = typeof code === 'number' ? `Simular ${code}` : `Simular ${code}`;
    btn.addEventListener('click', () => onForce(code, btn));
    grid.appendChild(btn);
  });

  wrap.appendChild(grid);
  container.appendChild(wrap);
}
