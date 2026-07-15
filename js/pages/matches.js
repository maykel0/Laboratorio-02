/**
 * pages/matches.js
 * ----------------
 * Controla matches.html. Obtiene /get/games UNA sola vez, la cachea, y aplica
 * el filtro de grupo/fase completamente en el cliente (evita gastar cuota de
 * rate-limit en refetches innecesarios).
 */

import { requireAuth } from '../auth.js';
import { renderSidebar, renderLoader, renderEmptyState, renderCacheBanner, createBadge, createRetryCounter, handleApiError } from '../ui.js';
import { apiFetch } from '../api.js';
import { DATA_ENDPOINTS } from '../config.js';

if (!requireAuth()) throw new Error('Redirigiendo a login');

renderSidebar('matches.html');

const section = document.getElementById('matches-section');
const filterSelect = document.getElementById('filter-group');

const STAGE_LABELS = {
  group: 'Fase de grupos',
  r32: 'Ronda de 32',
  r16: 'Octavos de final',
  qf: 'Cuartos de final',
  sf: 'Semifinal',
  third: 'Tercer lugar',
  final: 'Final',
};

let allMatches = [];

function matchStatusBadge(match) {
  if (String(match.finished).toUpperCase() === 'TRUE') return createBadge('Finalizado', 'finished');
  if (match.time_elapsed && match.time_elapsed !== 'notstarted') return createBadge('En vivo', 'live');
  return createBadge('Próximo', 'upcoming');
}

function buildFilterOptions() {
  const groups = Array.from(new Set(allMatches.map((m) => m.group))).sort();
  filterSelect.innerHTML = '<option value="all">Todas las fases</option>';
  groups.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = STAGE_LABELS[g.toLowerCase()] || `Grupo ${g}`;
    filterSelect.appendChild(opt);
  });
}

function renderMatches(matches) {
  section.querySelector('.card-grid')?.remove();
  section.querySelectorAll('.state').forEach((el) => el.remove());

  if (matches.length === 0) {
    renderEmptyState(section, 'No hay partidos para este filtro.');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'card-grid';

  matches
    .sort((a, b) => Number(a.id) - Number(b.id))
    .forEach((match) => {
      const card = document.createElement('article');
      card.className = 'card match-card';

      const homeName = match.home_team_name_en || match.home_team_label || 'Por definir';
      const awayName = match.away_team_name_en || match.away_team_label || 'Por definir';

      card.innerHTML = `
        <div class="match-card__meta"><span>${STAGE_LABELS[match.type] || match.type}</span><span>${match.local_date || ''}</span></div>
        <div class="match-card__teams">
          <div class="match-card__team">${homeName}</div>
          <div class="match-card__score">${match.home_score ?? '-'} : ${match.away_score ?? '-'}</div>
          <div class="match-card__team">${awayName}</div>
        </div>
      `;
      const badgeSlot = document.createElement('div');
      badgeSlot.appendChild(matchStatusBadge(match));
      card.appendChild(badgeSlot);
      grid.appendChild(card);
    });

  section.appendChild(grid);
}

function applyFilter() {
  const value = filterSelect.value;
  const filtered = value === 'all' ? allMatches : allMatches.filter((m) => m.group === value);
  renderMatches(filtered);
}

async function load() {
  renderLoader(section, 'Cargando partidos...');
  const counterEl = createRetryCounter(section);

  try {
    const result = await apiFetch('games', DATA_ENDPOINTS.games, { counterEl });
    allMatches = result.data?.games || [];
    section.innerHTML = '';
    if (result.fromCache) renderCacheBanner(section, result.cacheTimestamp);
    buildFilterOptions();
    applyFilter();
  } catch (err) {
    section.innerHTML = '';
    handleApiError(err, section);
    if (err.status !== 401) renderEmptyState(section, 'No fue posible cargar los partidos.');
  }
}

filterSelect.addEventListener('change', applyFilter);
load();
