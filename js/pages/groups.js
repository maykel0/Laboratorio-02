/**
 * pages/groups.js
 * ---------------
 * Controla groups.html. Pide /get/groups (obligatorio para pintar la tabla)
 * y /get/teams (opcional, solo para traducir IDs de equipo a nombres) de
 * forma INDEPENDIENTE. Si "teams" falla, la tabla igual se pinta mostrando
 * los IDs — nunca se rompe la vista por el fallo de una petición secundaria
 * (requisito #7).
 */

import { requireAuth } from '../auth.js';
import { renderSidebar, renderLoader, renderEmptyState, renderCacheBanner, handleApiError, escapeHtml } from '../ui.js';
import { apiFetch } from '../api.js';
import { DATA_ENDPOINTS } from '../config.js';

if (!requireAuth()) throw new Error('Redirigiendo a login');

renderSidebar('groups.html');

const section = document.getElementById('groups-section');

function normalizeGroups(data) {
  return Array.isArray(data) ? data : data?.groups || [];
}

function normalizeTeams(data) {
  return Array.isArray(data) ? data : data?.teams || [];
}

async function loadTeamsLookup() {
  try {
    const result = await apiFetch('teams', DATA_ENDPOINTS.teams);
    const teams = normalizeTeams(result.data);
    const lookup = new Map(teams.map((t) => [String(t.id), t.name_en]));
    return { lookup, cacheNotice: result.fromCache ? result.cacheTimestamp : null };
  } catch (err) {
    // Se degrada de forma elegante: sin nombres, se usarán los IDs.
    return { lookup: new Map(), cacheNotice: null, failed: true };
  }
}

function renderGroupsTable(groups, teamsLookup) {
  section.innerHTML = '';
  if (groups.length === 0) {
    renderEmptyState(section, 'No hay datos de grupos disponibles.');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'card-grid';

  groups
    .sort((a, b) => String(a.group).localeCompare(String(b.group)))
    .forEach((groupData) => {
      const card = document.createElement('article');
      card.className = 'card';

      const rows = (groupData.teams || [])
        .sort((a, b) => Number(b.pts) - Number(a.pts))
        .map((row) => {
          const name = teamsLookup.get(String(row.team_id)) || `Equipo #${escapeHtml(row.team_id)}`;
          return `<tr><td>${escapeHtml(name)}</td><td class="scoreboard-num">${escapeHtml(row.pts)}</td><td class="scoreboard-num">${escapeHtml(row.gf)}</td><td class="scoreboard-num">${escapeHtml(row.ga)}</td></tr>`;
        })
        .join('');

      card.innerHTML = `
        <h3>Grupo ${escapeHtml(groupData.group)}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <thead style="color:var(--text-dim);text-align:left;">
            <tr><th>Equipo</th><th>Pts</th><th>GF</th><th>GC</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      grid.appendChild(card);
    });

  section.appendChild(grid);
}

async function load() {
  renderLoader(section, 'Cargando tabla de grupos...');

  // Ambas peticiones se lanzan y resuelven de forma independiente.
  const teamsPromise = loadTeamsLookup();

  try {
    const groupsResult = await apiFetch('groups', DATA_ENDPOINTS.groups);
    const { lookup, cacheNotice } = await teamsPromise;

    const groups = normalizeGroups(groupsResult.data);
    renderGroupsTable(groups, lookup);

    if (groupsResult.fromCache) renderCacheBanner(section, groupsResult.cacheTimestamp);
    else if (cacheNotice) renderCacheBanner(section, cacheNotice);
  } catch (err) {
    section.innerHTML = '';
    handleApiError(err, section);
    if (err.status !== 401) renderEmptyState(section, 'No fue posible cargar la tabla de grupos.');
  }
}

load();
