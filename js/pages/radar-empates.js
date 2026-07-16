/**
 * pages/radar-empates.js
 * ------------------------
 * Categoría A · 2.5 "Radar de Empates".
 * Filtra partidos finalizados en empate y los agrupa por grupo (A-L). Los
 * partidos se obtienen con una sola petición a /get/games; pero, a propósito,
 * los NOMBRES de los equipos de cada grupo se piden grupo por grupo contra
 * /get/teams/?group=X (una petición real por cada grupo que tuvo empates),
 * para poder construir la matriz de forma progresiva.
 *
 * Reto de resiliencia: si llega un 429 mientras se construye un grupo, el
 * backoff exponencial se activa SOLO para esa petición pendiente (se ve el
 * countdown en pantalla), mientras los grupos ya dibujados antes permanecen
 * visibles sin tocarse. Nunca se usa alert(): el aviso de reintento vive en
 * el propio contador visible de retry.js.
 */

import { requireAuth } from '../auth.js';
import {
  renderSidebar, renderLoader, renderEmptyState,
  createRetryCounter, handleApiError, escapeHtml,
  indexTeamsById, teamDisplayHtml, isFinished,
} from '../ui.js';
import { apiFetch } from '../api.js';
import { DATA_ENDPOINTS } from '../config.js';

if (!requireAuth()) throw new Error('Redirigiendo a login');

renderSidebar('radar-empates.html');

const section = document.getElementById('draws-section');

function groupDrawsByLetter(games) {
  const draws = games.filter((g) => isFinished(g) && g.home_score === g.away_score);
  const grouped = {};
  draws.forEach((g) => {
    const letter = g.group;
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(g);
  });
  return grouped;
}

function renderGroupMatrix(container, letter, draws, teamsIdx, { fallback = false } = {}) {
  container.innerHTML = '';
  const title = document.createElement('h3');
  title.className = 'draw-group__title';
  title.innerHTML = `Grupo ${escapeHtml(letter)} <span class="badge badge--neutral">${draws.length} empate${draws.length === 1 ? '' : 's'}</span>`;
  if (fallback) {
    const badge = document.createElement('span');
    badge.className = 'badge badge--upcoming';
    badge.textContent = 'nombres no disponibles';
    title.appendChild(badge);
  }
  container.appendChild(title);

  const matrix = document.createElement('div');
  matrix.className = 'draw-matrix';
  draws.forEach((match) => {
    const cell = document.createElement('div');
    cell.className = 'draw-cell';
    cell.innerHTML = `
      <span>${teamDisplayHtml(teamsIdx, match.home_team_id, { withFlag: true })}</span>
      <strong>${escapeHtml(match.home_score)} : ${escapeHtml(match.away_score)}</strong>
      <span>${teamDisplayHtml(teamsIdx, match.away_team_id, { withFlag: true })}</span>
    `;
    matrix.appendChild(cell);
  });
  container.appendChild(matrix);
}

async function load() {
  renderLoader(section, 'Cargando partidos...');
  let games;
  try {
    const result = await apiFetch('games', DATA_ENDPOINTS.games, { counterEl: createRetryCounter(section) });
    games = result.data?.games || [];
  } catch (err) {
    section.innerHTML = '';
    handleApiError(err, section);
    return;
  }

  const grouped = groupDrawsByLetter(games);
  const letters = Object.keys(grouped).sort();

  section.innerHTML = '';

  if (letters.length === 0) {
    renderEmptyState(section, 'Todavía no hay partidos finalizados en empate.');
    return;
  }

  // Contador compartido: se reutiliza en cada iteración del bucle secuencial.
  const counterEl = createRetryCounter(section);

  // A propósito NO se usa Promise.all: se construye grupo por grupo, en
  // orden, para que un 429/500 en un grupo no bloquee ni oculte los
  // anteriores, que ya quedaron pintados en el DOM.
  for (const letter of letters) {
    const groupSection = document.createElement('div');
    groupSection.className = 'draw-group';
    section.appendChild(groupSection);
    renderLoader(groupSection, `Cargando equipos del grupo ${letter}...`);

    try {
      const teamsResult = await apiFetch(`teams-group-${letter}`, DATA_ENDPOINTS.teamsByGroup(letter), { counterEl });
      const teamsIdx = indexTeamsById(teamsResult.data);
      renderGroupMatrix(groupSection, letter, grouped[letter], teamsIdx);
    } catch (err) {
      if (err.status === 401) { handleApiError(err, null); return; }
      // Fallback: ese grupo se pinta igual, con ids en vez de nombres,
      // sin afectar a los grupos ya renderizados antes en el bucle.
      renderGroupMatrix(groupSection, letter, grouped[letter], new Map(), { fallback: true });
    }
  }
}

load();
