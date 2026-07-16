/**
 * pages/goleadas.js
 * ------------------
 * Categoría A · 2.2 "Rastreador de Goleadas".
 * Filtra partidos finalizados con diferencia de gol ≥ 3, los ordena de mayor
 * a menor diferencia, y cruza los ids de equipos contra /get/teams para
 * mostrar nombre y bandera reales en vez del id crudo.
 *
 * Reto de resiliencia: games y teams se piden en paralelo. Si /get/teams
 * falla pero /get/games respondió bien, la lista se renderiza IGUAL usando
 * los ids como respaldo temporal — nunca se bloquea la vista completa por
 * un fallo en la petición secundaria. La petición de equipos se sigue
 * reintentando en segundo plano (backgroundRetry, ver retry.js) hasta que
 * se recupera, momento en el que la lista se vuelve a pintar con los
 * nombres reales sin que el usuario tenga que recargar la página.
 */

import { requireAuth } from '../auth.js';
import {
  renderSidebar, renderLoader, renderEmptyState, renderErrorBanner,
  createRetryCounter, handleApiError, escapeHtml,
  indexTeamsById, teamDisplayHtml, isFinished,
} from '../ui.js';
import { apiFetch } from '../api.js';
import { backgroundRetry } from '../retry.js';
import { DATA_ENDPOINTS } from '../config.js';

if (!requireAuth()) throw new Error('Redirigiendo a login');

renderSidebar('goleadas.html');

const section = document.getElementById('goleadas-section');

let blowouts = [];
let teamsIndex = null; // null mientras no llega ninguna respuesta exitosa de /get/teams

function computeBlowouts(games) {
  return games
    .filter((g) => isFinished(g))
    .map((g) => ({ ...g, diff: Math.abs(Number(g.home_score) - Number(g.away_score)) }))
    .filter((g) => g.diff >= 3)
    .sort((a, b) => b.diff - a.diff);
}

function render() {
  section.innerHTML = '';

  if (!teamsIndex) {
    renderErrorBanner(section, 'No se pudieron cargar los nombres de los equipos todavía. Mostrando ids mientras se reintenta en segundo plano...');
  }

  if (blowouts.length === 0) {
    renderEmptyState(section, 'No hay goleadas (diferencia ≥ 3) entre los partidos finalizados.');
    return;
  }

  const header = document.createElement('p');
  header.innerHTML = `<strong>${blowouts.length}</strong> goleada${blowouts.length === 1 ? '' : 's'} encontrada${blowouts.length === 1 ? '' : 's'}.`;
  section.appendChild(header);

  const list = document.createElement('div');
  list.className = 'rank-list';

  blowouts.forEach((match, i) => {
    const homeHtml = teamDisplayHtml(teamsIndex, match.home_team_id, { withFlag: true });
    const awayHtml = teamDisplayHtml(teamsIndex, match.away_team_id, { withFlag: true });
    const row = document.createElement('div');
    row.className = 'rank-row';
    row.innerHTML = `
      <div class="rank-row__pos">${i + 1}</div>
      <div>
        <div>${homeHtml} <strong>${escapeHtml(match.home_score)} : ${escapeHtml(match.away_score)}</strong> ${awayHtml}</div>
        <div class="rank-row__detail">${escapeHtml(match.local_date || '')}</div>
      </div>
      <div class="rank-row__value">Δ ${match.diff}</div>
    `;
    list.appendChild(row);
  });

  section.appendChild(list);
}

async function loadGames() {
  renderLoader(section, 'Cargando partidos...');
  const counterEl = createRetryCounter(section);
  try {
    const result = await apiFetch('games', DATA_ENDPOINTS.games, { counterEl });
    blowouts = computeBlowouts(result.data?.games || []);
    render();
  } catch (err) {
    section.innerHTML = '';
    handleApiError(err, section);
  }
}

async function loadTeams() {
  try {
    const result = await apiFetch('teams', DATA_ENDPOINTS.teams);
    teamsIndex = indexTeamsById(result.data);
    render(); // ya sea la primera carga exitosa o la recuperación en segundo plano
  } catch (err) {
    if (err.status === 401) {
      handleApiError(err, null);
      return; // no tiene sentido seguir reintentando si la sesión expiró
    }
    // Reintento indefinido en segundo plano: no bloquea, no rompe la vista.
    backgroundRetry(
      () => apiFetch('teams', DATA_ENDPOINTS.teams),
      (result) => { teamsIndex = indexTeamsById(result.data); render(); }
    );
  }
}

loadGames();
loadTeams();
