/**
 * pages/ruta-campeon.js
 * ----------------------
 * Categoría A · 2.1 "La Ruta del Campeón".
 * Cruza tres colecciones (teams, games, stadiums) para construir, por
 * equipo elegido, un itinerario de partidos con ciudad/estadio/aforo —
 * una vista que no existe como tal en ningún endpoint individual de la API.
 *
 * Reto de resiliencia: teams y games se piden UNA sola vez al cargar la
 * página y se guardan en memoria; nunca se vuelven a pedir al cambiar de
 * equipo (eso solo re-filtra datos ya obtenidos). stadiums se pide también
 * una sola vez, en paralelo. Si esa petición falla (incluso después de que
 * ya se armó el itinerario con partidos), las tarjetas ya renderizadas NO
 * desaparecen: el campo de estadio de cada una pasa a mostrar
 * "Estadio no disponible", y solo esa petición entra en backoff exponencial.
 */

import { requireAuth } from '../auth.js';
import {
  renderSidebar, renderLoader, renderEmptyState, renderErrorBanner,
  createRetryCounter, handleApiError, escapeHtml,
  indexTeamsById, indexStadiumsById, isFinished,
} from '../ui.js';
import { apiFetch } from '../api.js';
import { DATA_ENDPOINTS } from '../config.js';

if (!requireAuth()) throw new Error('Redirigiendo a login');

renderSidebar('ruta-campeon.html');

const teamSelect = document.getElementById('team-select');
const section = document.getElementById('itinerary-section');

/** Estado en memoria: se llena una sola vez y se reutiliza para cualquier equipo. */
let teamsIndex = null;
let allGames = [];
let stadiumsIndex = null;
let stadiumsFailed = false;
let selectedTeamId = null;

const STAGE_LABELS = {
  group: 'Fase de grupos', r32: 'Ronda de 32', r16: 'Octavos de final',
  qf: 'Cuartos de final', sf: 'Semifinal', third: 'Tercer lugar', final: 'Final',
};

function populateTeamSelect() {
  teamSelect.innerHTML = '<option value="">Elegí un equipo...</option>';
  const teams = Array.from(teamsIndex.values()).sort((a, b) => (a.name_en || '').localeCompare(b.name_en || ''));
  teams.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name_en} (Grupo ${t.groups})`;
    teamSelect.appendChild(opt);
  });
}

/** Arma y pinta el itinerario del equipo actualmente seleccionado con los datos disponibles AHORA. */
function renderItineraryForSelectedTeam() {
  if (!selectedTeamId) {
    renderEmptyState(section, 'Elegí un equipo para ver su ruta hacia la final.');
    return;
  }

  const teamMatches = allGames
    .filter((g) => g.home_team_id === selectedTeamId || g.away_team_id === selectedTeamId)
    .sort((a, b) => new Date(a.local_date) - new Date(b.local_date));

  section.innerHTML = '';

  if (teamMatches.length === 0) {
    renderEmptyState(section, 'No se encontraron partidos para este equipo todavía.');
    return;
  }

  if (stadiumsFailed) {
    renderErrorBanner(section, 'No se pudo obtener la información de estadios. Se muestran los partidos igual; el campo de sede indica "Estadio no disponible".');
  }

  const citiesVisited = new Set();
  const list = document.createElement('div');
  list.className = 'itinerary';

  teamMatches.forEach((match) => {
    const isHome = match.home_team_id === selectedTeamId;
    const rivalName = isHome
      ? (match.away_team_name_en || match.away_team_label || 'Por definir')
      : (match.home_team_name_en || match.home_team_label || 'Por definir');

    const stadium = stadiumsIndex?.get(String(match.stadium_id));
    let venueHtml;
    if (stadium) {
      citiesVisited.add(stadium.city_en);
      venueHtml = `<div class="itinerary-card__venue">🏟️ ${escapeHtml(stadium.name_en)} · ${escapeHtml(stadium.city_en)}, ${escapeHtml(stadium.country_en)} · Aforo ${Number(stadium.capacity).toLocaleString('es')}</div>`;
    } else if (stadiumsFailed) {
      venueHtml = `<div class="itinerary-card__venue itinerary-card__venue--missing">🏟️ Estadio no disponible</div>`;
    } else {
      venueHtml = `<div class="itinerary-card__venue">🏟️ Cargando estadio...</div>`;
    }

    const card = document.createElement('article');
    card.className = 'itinerary-card';
    card.innerHTML = `
      <div class="itinerary-card__day">${escapeHtml((match.local_date || '').split(' ')[0] || '')}</div>
      <div class="itinerary-card__main">
        <div class="itinerary-card__teams">
          ${escapeHtml(STAGE_LABELS[match.type] || match.type)} · vs ${escapeHtml(rivalName)}
          ${isFinished(match) ? ` — ${escapeHtml(match.home_score)}:${escapeHtml(match.away_score)}` : ''}
        </div>
        ${venueHtml}
      </div>
    `;
    list.appendChild(card);
  });

  const summary = document.createElement('p');
  summary.className = 'itinerary-summary';
  summary.innerHTML = stadiumsIndex
    ? `<strong>${teamMatches.length}</strong> partido${teamMatches.length === 1 ? '' : 's'} encontrados, en <strong>${citiesVisited.size}</strong> ciudad${citiesVisited.size === 1 ? '' : 'es'} distinta${citiesVisited.size === 1 ? '' : 's'}.`
    : `<strong>${teamMatches.length}</strong> partido${teamMatches.length === 1 ? '' : 's'} encontrados. El conteo de ciudades se calculará cuando los datos de estadios estén disponibles.`;

  section.prepend(summary);
  section.appendChild(list);
}

async function loadTeams() {
  const counterEl = createRetryCounter(section);
  try {
    const result = await apiFetch('teams', DATA_ENDPOINTS.teams, { counterEl });
    teamsIndex = indexTeamsById(result.data);
    populateTeamSelect();
  } catch (err) {
    handleApiError(err, section);
  }
}

async function loadGames() {
  try {
    const result = await apiFetch('games', DATA_ENDPOINTS.games);
    allGames = result.data?.games || [];
    if (selectedTeamId) renderItineraryForSelectedTeam();
  } catch (err) {
    handleApiError(err, section);
  }
}

async function loadStadiums() {
  try {
    const result = await apiFetch('stadiums', DATA_ENDPOINTS.stadiums);
    stadiumsIndex = indexStadiumsById(result.data);
    stadiumsFailed = false;
  } catch (err) {
    // No se limpia el itinerario ya renderizado: solo se marca el fallo
    // para que el campo de sede de cada tarjeta muestre el aviso.
    stadiumsFailed = true;
    if (err.status === 401) handleApiError(err, null);
  } finally {
    if (selectedTeamId) renderItineraryForSelectedTeam();
  }
}

teamSelect.addEventListener('change', () => {
  selectedTeamId = teamSelect.value || null;
  renderItineraryForSelectedTeam();
});

renderLoader(section, 'Cargando equipos...');
loadTeams();
loadGames();
loadStadiums();
