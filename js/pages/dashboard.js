/**
 * pages/dashboard.js
 * ------------------
 * Controla dashboard.html: pinta cuatro tarjetas resumen (partidos, equipos,
 * grupos, estadios), cada una obtenida con una petición INDEPENDIENTE, para
 * demostrar el requisito #7 (si una falla, las demás siguen funcionando).
 * También monta el panel de pruebas de resiliencia.
 */

import { requireAuth } from '../auth.js';
import { renderSidebar, renderLoader, renderErrorBanner, renderCacheBanner, renderResiliencePanel, handleApiError } from '../ui.js';
import { apiFetch, forceNextFailure } from '../api.js';
import { DATA_ENDPOINTS } from '../config.js';

if (!requireAuth()) {
  // requireAuth ya redirigió a index.html; no continuar ejecutando el módulo.
  throw new Error('Redirigiendo a login');
}

renderSidebar('dashboard.html');

const summarySection = document.getElementById('summary-section');
const resilienceSection = document.getElementById('resilience-section');

const CARDS = [
  { key: 'games', label: 'Partidos', endpoint: DATA_ENDPOINTS.games, icon: '⚽', extractCount: (d) => d?.games?.length ?? 0 },
  { key: 'teams', label: 'Equipos', endpoint: DATA_ENDPOINTS.teams, icon: '👥', extractCount: (d) => (Array.isArray(d) ? d.length : d?.teams?.length ?? 0) },
  { key: 'groups', label: 'Grupos', endpoint: DATA_ENDPOINTS.groups, icon: '📊', extractCount: (d) => (Array.isArray(d) ? d.length : d?.groups?.length ?? 0) },
  { key: 'stadiums', label: 'Estadios', endpoint: DATA_ENDPOINTS.stadiums, icon: '🏟️', extractCount: (d) => (Array.isArray(d) ? d.length : d?.stadiums?.length ?? 0) },
];

/**
 * Pinta las 4 tarjetas resumen. Cada tarjeta gestiona su propio ciclo de
 * carga/error/caché de forma AISLADA: un fallo en "grupos" no debe borrar
 * ni afectar la tarjeta de "partidos".
 */
async function loadSummary() {
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  summarySection.innerHTML = '';
  summarySection.appendChild(grid);

  CARDS.forEach((cardDef) => {
    const cardEl = document.createElement('article');
    cardEl.className = 'card';
    renderLoader(cardEl, `Cargando ${cardDef.label.toLowerCase()}...`);
    grid.appendChild(cardEl);
    loadOneCard(cardDef, cardEl); // se dispara sin await: en paralelo e independiente
  });
}

async function loadOneCard(cardDef, cardEl) {
  try {
    const result = await apiFetch(cardDef.key, cardDef.endpoint);
    paintCard(cardEl, cardDef, result);
  } catch (err) {
    cardEl.innerHTML = '';
    const header = document.createElement('div');
    header.innerHTML = `<span aria-hidden="true">${cardDef.icon}</span> <strong>${cardDef.label}</strong>`;
    cardEl.appendChild(header);
    handleApiError(err, cardEl);
  }
}

function paintCard(cardEl, cardDef, result) {
  cardEl.innerHTML = '';
  if (result.fromCache) {
    renderCacheBanner(cardEl, result.cacheTimestamp);
  }
  const count = cardDef.extractCount(result.data);
  const body = document.createElement('div');
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-size:1.6rem;" aria-hidden="true">${cardDef.icon}</span>
      <div>
        <div class="scoreboard-num" style="font-size:1.8rem;line-height:1;">${count}</div>
        <div style="color:var(--text-dim);font-size:0.85rem;">${cardDef.label}</div>
      </div>
    </div>
  `;
  cardEl.appendChild(body);
}

/**
 * Panel de pruebas de resiliencia: fuerza un escenario de error y vuelve a
 * pedir "partidos" para que se vea en vivo cómo reacciona la interfaz.
 */
function setupResiliencePanel() {
  const card = document.createElement('div');
  card.className = 'card';
  resilienceSection.appendChild(card);

  renderResiliencePanel(card, async (code, btn) => {
    btn.disabled = true;
    forceNextFailure({ status: code });

    const demoOutput = document.getElementById('resilience-demo-output') || createDemoOutput(card);
    renderLoader(demoOutput, `Simulando escenario "${code}" sobre /get/games...`);
    const counterEl = document.createElement('p');
    counterEl.hidden = true;
    counterEl.className = 'retry-counter';
    demoOutput.prepend(counterEl);

    try {
      const result = await apiFetch('games', DATA_ENDPOINTS.games, { counterEl });
      demoOutput.innerHTML = '';
      if (result.fromCache) renderCacheBanner(demoOutput, result.cacheTimestamp);
      const ok = document.createElement('p');
      ok.textContent = `✅ La petición terminó exitosamente (posiblemente tras reintentos) con ${result.data?.games?.length ?? 0} partidos.`;
      demoOutput.appendChild(ok);
    } catch (err) {
      demoOutput.innerHTML = '';
      if (err.status === 401) {
        const note = document.createElement('p');
        note.textContent = `Escenario "${code}" → se limpió la sesión y se mostró el modal de "Sesión expirada".`;
        demoOutput.appendChild(note);
        handleApiError(err, null);
      } else {
        renderErrorBanner(demoOutput, `Escenario "${code}" → ${err.message}`);
      }
    } finally {
      btn.disabled = false;
    }
  });
}

function createDemoOutput(card) {
  const el = document.createElement('div');
  el.id = 'resilience-demo-output';
  el.style.marginTop = '14px';
  card.appendChild(el);
  return el;
}

loadSummary();
setupResiliencePanel();
