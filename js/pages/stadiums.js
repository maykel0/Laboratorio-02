/**
 * pages/stadiums.js
 * -----------------
 * Controla stadiums.html. Obtiene /get/stadiums y pinta una tarjeta por
 * cada uno de los 16 estadios sede.
 */

import { requireAuth } from '../auth.js';
import { renderSidebar, renderLoader, renderEmptyState, renderCacheBanner, createRetryCounter, handleApiError, escapeHtml } from '../ui.js';
import { apiFetch } from '../api.js';
import { DATA_ENDPOINTS } from '../config.js';

if (!requireAuth()) throw new Error('Redirigiendo a login');

renderSidebar('stadiums.html');

const section = document.getElementById('stadiums-section');

function normalizeStadiums(data) {
  return Array.isArray(data) ? data : data?.stadiums || [];
}

function renderStadiums(stadiums) {
  section.innerHTML = '';
  if (stadiums.length === 0) {
    renderEmptyState(section, 'No hay estadios para mostrar.');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'card-grid';

  stadiums
    .sort((a, b) => Number(b.capacity) - Number(a.capacity))
    .forEach((stadium) => {
      const card = document.createElement('article');
      card.className = 'card stadium-card';
      card.innerHTML = `
        <strong>${escapeHtml(stadium.name_en)}</strong>
        <span style="color:var(--text-dim);font-size:0.85rem;">${escapeHtml(stadium.city_en)}, ${escapeHtml(stadium.country_en)}</span>
        <div class="stadium-card__capacity scoreboard-num">${Number(stadium.capacity).toLocaleString('es')} <span style="font-size:0.75rem;color:var(--text-dim);font-family:'Inter',sans-serif;">asientos</span></div>
      `;
      grid.appendChild(card);
    });

  section.appendChild(grid);
}

async function load() {
  renderLoader(section, 'Cargando estadios...');
  const counterEl = createRetryCounter(section);

  try {
    const result = await apiFetch('stadiums', DATA_ENDPOINTS.stadiums, { counterEl });
    section.innerHTML = '';
    if (result.fromCache) renderCacheBanner(section, result.cacheTimestamp);
    renderStadiums(normalizeStadiums(result.data));
  } catch (err) {
    section.innerHTML = '';
    handleApiError(err, section);
    if (err.status !== 401) renderEmptyState(section, 'No fue posible cargar los estadios.');
  }
}

load();
