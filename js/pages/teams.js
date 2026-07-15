/**
 * pages/teams.js
 * --------------
 * Controla teams.html. Obtiene /get/teams una sola vez y filtra en el
 * cliente por grupo y por texto de búsqueda.
 */

import { requireAuth } from '../auth.js';
import { renderSidebar, renderLoader, renderEmptyState, renderCacheBanner, createRetryCounter, handleApiError, escapeHtml } from '../ui.js';
import { apiFetch } from '../api.js';
import { DATA_ENDPOINTS } from '../config.js';

if (!requireAuth()) throw new Error('Redirigiendo a login');

renderSidebar('teams.html');

const section = document.getElementById('teams-section');
const filterGroup = document.getElementById('filter-group');
const filterSearch = document.getElementById('filter-search');

let allTeams = [];

function normalizeTeams(data) {
  // La API puede devolver un arreglo directo o un objeto envoltorio; se
  // soportan ambas formas para no romper la interfaz ante pequeños cambios.
  if (Array.isArray(data)) return data;
  return data?.teams || [];
}

function buildFilterOptions() {
  const groups = Array.from(new Set(allTeams.map((t) => t.groups || t.group).filter(Boolean))).sort();
  filterGroup.innerHTML = '<option value="all">Todos los grupos</option>';
  groups.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = `Grupo ${g}`;
    filterGroup.appendChild(opt);
  });
}

function renderTeams(teams) {
  section.querySelectorAll('.card-grid, .state').forEach((el) => el.remove());

  if (teams.length === 0) {
    renderEmptyState(section, 'No se encontraron equipos con ese filtro.');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'card-grid';

  teams.forEach((team) => {
    const card = document.createElement('article');
    card.className = 'card team-card';
    const flag = team.flag
      ? `<img class="team-card__flag" src="${team.flag}" alt="Bandera de ${escapeHtml(team.name_en)}" loading="lazy" />`
      : '<div class="team-card__flag" aria-hidden="true"></div>';
    card.innerHTML = `
      ${flag}
      <strong>${escapeHtml(team.name_en || team.name || 'Equipo')}</strong>
      <span style="color:var(--text-dim);font-size:0.85rem;">${escapeHtml(team.fifa_code || '')} · Grupo ${escapeHtml(team.groups || team.group || '?')}</span>
    `;
    grid.appendChild(card);
  });

  section.appendChild(grid);
}

function applyFilters() {
  const group = filterGroup.value;
  const search = filterSearch.value.trim().toLowerCase();
  const filtered = allTeams.filter((t) => {
    const matchesGroup = group === 'all' || (t.groups || t.group) === group;
    const matchesSearch = !search || (t.name_en || '').toLowerCase().includes(search);
    return matchesGroup && matchesSearch;
  });
  renderTeams(filtered);
}

async function load() {
  renderLoader(section, 'Cargando equipos...');
  const counterEl = createRetryCounter(section);

  try {
    const result = await apiFetch('teams', DATA_ENDPOINTS.teams, { counterEl });
    allTeams = normalizeTeams(result.data);
    section.innerHTML = '';
    if (result.fromCache) renderCacheBanner(section, result.cacheTimestamp);
    buildFilterOptions();
    applyFilters();
  } catch (err) {
    section.innerHTML = '';
    handleApiError(err, section);
    if (err.status !== 401) renderEmptyState(section, 'No fue posible cargar los equipos.');
  }
}

filterGroup.addEventListener('change', applyFilters);
filterSearch.addEventListener('input', applyFilters);
load();
