/**
 * pages/muro.js
 * -------------
 * Categoría A · 2.3 "El Muro".
 * Recorre los 12 grupos de /get/groups, extrae el "ga" (goles en contra) de
 * cada uno de los 48 equipos, los ordena ascendente, toma los 5 mejores y
 * cruza contra /get/teams (nombre, bandera) y /get/games (próximo rival).
 *
 * Reto de resiliencia: la búsqueda del próximo rival se evalúa equipo por
 * equipo, dentro de un try/catch individual. Si esa búsqueda falla para uno
 * solo de los 5 (por ejemplo datos de partidos incompletos para ese equipo),
 * esa fila muestra "Próximo rival no disponible" mientras las otras 4 siguen
 * mostrando su dato completo con normalidad — un fallo aislado no tira abajo
 * el ranking entero.
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

renderSidebar('muro.html');

const section = document.getElementById('muro-section');

/**
 * Busca el próximo partido (finished === false) de un equipo, ordenado por
 * fecha. Aislada en su propia función para poder envolverla en try/catch
 * individual por equipo sin afectar al resto del ranking.
 */
function findNextMatch(teamId, allGames) {
  const upcoming = allGames
    .filter((g) => (g.home_team_id === teamId || g.away_team_id === teamId) && !isFinished(g))
    .sort((a, b) => new Date(a.local_date) - new Date(b.local_date));
  if (upcoming.length === 0) return null;
  const match = upcoming[0];
  const isHome = match.home_team_id === teamId;
  const rivalId = isHome ? match.away_team_id : match.home_team_id;
  const rivalLabel = isHome
    ? (match.away_team_name_en || match.away_team_label)
    : (match.home_team_name_en || match.home_team_label);
  return { rivalId, rivalLabel, date: match.local_date };
}

function renderRanking(top5, teamsIndex, allGames) {
  section.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'rank-list';

  top5.forEach((entry, i) => {
    let nextRivalHtml;
    try {
      const next = findNextMatch(entry.team_id, allGames);
      nextRivalHtml = next
        ? `Próximo rival: ${escapeHtml(next.rivalLabel || `ID ${next.rivalId}`)} (${escapeHtml(next.date || '')})`
        : 'Sin próximo partido programado.';
    } catch {
      nextRivalHtml = '<span class="rank-row__pending">Próximo rival no disponible</span>';
    }

    const row = document.createElement('div');
    row.className = 'rank-row';
    row.innerHTML = `
      <div class="rank-row__pos">${i + 1}</div>
      <div>
        <div>${teamDisplayHtml(teamsIndex, entry.team_id, { withFlag: true })}</div>
        <div class="rank-row__detail">${nextRivalHtml}</div>
      </div>
      <div class="rank-row__value">${entry.ga} GC</div>
    `;
    list.appendChild(row);
  });

  section.appendChild(list);
}

async function load() {
  renderLoader(section, 'Cargando grupos...');
  const counterEl = createRetryCounter(section);

  let groupsData, teamsData, gamesData;
  try {
    const groupsResult = await apiFetch('groups', DATA_ENDPOINTS.groups, { counterEl });
    groupsData = groupsResult.data;
  } catch (err) {
    section.innerHTML = '';
    handleApiError(err, section);
    return; // sin grupos no hay ranking posible: es la colección base de este cruce
  }

  try {
    const teamsResult = await apiFetch('teams', DATA_ENDPOINTS.teams);
    teamsData = indexTeamsById(teamsResult.data);
  } catch (err) {
    if (err.status === 401) { handleApiError(err, null); return; }
    teamsData = new Map(); // se degrada a mostrar ids, no bloquea la vista
  }

  try {
    const gamesResult = await apiFetch('games', DATA_ENDPOINTS.games);
    gamesData = gamesResult.data?.games || [];
  } catch {
    gamesData = []; // sin partidos, findNextMatch simplemente no encontrará nada
  }

  const groupsArr = Array.isArray(groupsData) ? groupsData : groupsData?.groups || [];
  const allEntries = groupsArr.flatMap((g) =>
    (g.teams || []).map((t) => ({ team_id: String(t.team_id), ga: Number(t.ga) }))
  );

  if (allEntries.length === 0) {
    renderEmptyState(section, 'No hay datos de grupos disponibles todavía.');
    return;
  }

  const top5 = allEntries.sort((a, b) => a.ga - b.ga).slice(0, 5);
  renderRanking(top5, teamsData, gamesData);
}

load();
