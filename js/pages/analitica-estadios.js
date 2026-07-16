/**
 * pages/analitica-estadios.js
 * ----------------------------
 * Categoría A · 2.4 "Analítica de Estadios".
 * Por cada uno de los 16 estadios, cuenta cuántos partidos de /get/games
 * se juegan ahí y calcula una "asistencia potencial total" (capacidad ×
 * partidos albergados), ordenando de mayor a menor.
 *
 * Reto de resiliencia: los estadios se cargan PRIMERO y se dibujan de
 * inmediato (nombre + capacidad). Si la petición de partidos falla después,
 * la gráfica entra en un estado de "esperando datos de partidos" sin borrar
 * las barras de estadios ya dibujadas — solo esa petición de partidos entra
 * en backoff exponencial (vía el retry interno de apiFetch).
 */

import { requireAuth } from '../auth.js';
import { renderSidebar, renderLoader, renderEmptyState, createRetryCounter, handleApiError, escapeHtml } from '../ui.js';
import { apiFetch } from '../api.js';
import { DATA_ENDPOINTS } from '../config.js';

if (!requireAuth()) throw new Error('Redirigiendo a login');

renderSidebar('analitica-estadios.html');

const section = document.getElementById('stadiums-stats-section');

let stadiums = [];
let matchCounts = null; // null = todavía no llegaron los datos de partidos (o fallaron)

function render() {
  section.innerHTML = '';

  if (stadiums.length === 0) {
    renderEmptyState(section, 'No hay datos de estadios disponibles todavía.');
    return;
  }

  const enriched = stadiums.map((s) => ({
    ...s,
    matches: matchCounts?.get(String(s.id)) ?? 0,
    potential: (matchCounts?.get(String(s.id)) ?? 0) * Number(s.capacity),
  }));

  if (matchCounts) enriched.sort((a, b) => b.potential - a.potential);

  if (!matchCounts) {
    const note = document.createElement('p');
    note.className = 'rank-row__pending';
    note.textContent = '⏳ Esperando datos de partidos para calcular asistencia potencial. Reintentando automáticamente...';
    section.appendChild(note);
  }

  const maxCapacity = Math.max(...stadiums.map((s) => Number(s.capacity)));
  const maxMatches = matchCounts ? Math.max(1, ...Array.from(matchCounts.values())) : 1;

  const wrap = document.createElement('div');
  wrap.className = 'stat-bars';

  enriched.forEach((s) => {
    const card = document.createElement('article');
    card.className = 'card';

    const capacityPct = (Number(s.capacity) / maxCapacity) * 100;
    const matchesPct = matchCounts ? ((s.matches / maxMatches) * 100) : 0;

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
        <strong>${escapeHtml(s.name_en)}</strong>
        <span class="scoreboard-num" style="color:var(--pitch);">${matchCounts ? s.potential.toLocaleString('es') : '—'}</span>
      </div>
      <div class="stat-bar-row">
        <span class="stat-bar-row__label">Capacidad</span>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${capacityPct}%;"></div></div>
        <span class="stat-bar-row__value">${Number(s.capacity).toLocaleString('es')}</span>
      </div>
      <div class="stat-bar-row">
        <span class="stat-bar-row__label">Partidos albergados</span>
        <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-fill--secondary" style="width:${matchesPct}%;"></div></div>
        <span class="stat-bar-row__value">${matchCounts ? s.matches : '—'}</span>
      </div>
    `;
    wrap.appendChild(card);
  });

  section.appendChild(wrap);
}

async function loadStadiums() {
  renderLoader(section, 'Cargando estadios...');
  const counterEl = createRetryCounter(section);
  try {
    const result = await apiFetch('stadiums', DATA_ENDPOINTS.stadiums);
    stadiums = Array.isArray(result.data) ? result.data : result.data?.stadiums || [];
    render();
  } catch (err) {
    section.innerHTML = '';
    handleApiError(err, section);
  }
}

async function loadGames() {
  try {
    const result = await apiFetch('games', DATA_ENDPOINTS.games);
    const games = result.data?.games || [];
    const counts = new Map();
    games.forEach((g) => {
      const key = String(g.stadium_id);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    matchCounts = counts;
    render();
  } catch (err) {
    // No se toca `stadiums`: las barras ya dibujadas permanecen intactas.
    // matchCounts se queda en null, así que render() muestra el estado de espera.
    if (err.status === 401) handleApiError(err, null);
  }
}

loadStadiums();
loadGames();
