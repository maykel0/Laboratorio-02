/**
 * retry.js
 * --------
 * Qué hace: envuelve una operación asíncrona (una petición fetch) con lógica
 * de reintentos usando backoff exponencial (1s, 2s, 4s, 8s, 16s).
 * Por qué existe: requisito #5. Cuando la API responde 429 (rate limit) o 500
 * (error de servidor), la app no debe fallar de inmediato: debe esperar cada
 * vez más tiempo entre intentos, dando oportunidad a que el servidor se recupere.
 * Problema que resuelve: evita que un pico de tráfico o un error transitorio
 * tumbe la experiencia del usuario.
 */

import { RETRY_CONFIG } from './config.js';

/**
 * Espera "ms" milisegundos. Usado únicamente con await (nunca .then()).
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Muestra un contador regresivo en un elemento del DOM mientras se espera
 * el siguiente reintento. Se actualiza cada segundo, tal como exige el requisito 5.
 * @param {HTMLElement} counterEl - elemento donde escribir el texto del contador
 * @param {number} totalSeconds
 */
async function runVisibleCountdown(counterEl, totalSeconds) {
  for (let remaining = totalSeconds; remaining > 0; remaining--) {
    if (counterEl) {
      counterEl.textContent = `Reintentando en ${remaining} segundo${remaining === 1 ? '' : 's'}...`;
      counterEl.hidden = false;
    }
    await wait(1000);
  }
  if (counterEl) counterEl.hidden = true;
}

/**
 * Ejecuta `attemptFn` con reintentos y backoff exponencial.
 *
 * @param {() => Promise<Response>} attemptFn - función que realiza el fetch y
 *        devuelve el objeto Response (sin lanzar excepción por status HTTP).
 * @param {object} options
 * @param {HTMLElement} [options.counterEl] - elemento del DOM para el contador visible (429)
 * @param {(attempt:number, status:number) => void} [options.onRetry] - callback informativo
 * @returns {Promise<Response>} la respuesta final (exitosa o el último intento fallido)
 */
export async function retryFetch(attemptFn, options = {}) {
  const { counterEl, onRetry } = options;
  const { baseDelayMs, maxRetries, retryableStatusCodes } = RETRY_CONFIG;

  let lastResponse = null;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await attemptFn();

      // Si la respuesta es exitosa o el código no es reintentable, se retorna tal cual
      // para que la capa superior (api.js) decida cómo manejarla.
      if (response.ok || !retryableStatusCodes.includes(response.status)) {
        return response;
      }

      lastResponse = response;

      // Si ya se agotaron los reintentos, se retorna la última respuesta fallida.
      if (attempt === maxRetries) {
        return response;
      }

      const delaySeconds = (baseDelayMs / 1000) * Math.pow(2, attempt); // 1,2,4,8,16
      if (onRetry) onRetry(attempt + 1, response.status);

      // El contador visible en pantalla solo tiene sentido para 429 (rate limit),
      // pero se muestra para cualquier código reintentable para dar feedback honesto.
      await runVisibleCountdown(counterEl, delaySeconds);
    } catch (networkErr) {
      // Error de red real (sin conexión, DNS, CORS, etc.)
      lastError = networkErr;
      if (attempt === maxRetries) break;
      const delaySeconds = (baseDelayMs / 1000) * Math.pow(2, attempt);
      if (onRetry) onRetry(attempt + 1, 'network-error');
      await runVisibleCountdown(counterEl, delaySeconds);
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error('Fallo de red desconocido tras reintentos');
}

/**
 * Reintenta `taskFn` en segundo plano, indefinidamente, cada `intervalMs`,
 * hasta que tenga éxito o se llame a la función de cancelación devuelta.
 * Por qué existe: requisito 2.2 (Rastreador de Goleadas). `retryFetch` ya
 * agota sus 5 reintentos con backoff y termina lanzando un error — eso basta
 * para la petición "en primer plano". Pero cuando esa petición es secundaria
 * (por ejemplo /get/teams, usada solo para mostrar nombres en vez de ids) no
 * queremos bloquear ni romper la vista: la seguimos reintentando en segundo
 * plano para que, apenas el servidor se recupere, la UI se actualice sola,
 * sin que el usuario tenga que recargar la página.
 * @param {() => Promise<any>} taskFn
 * @param {(result:any) => void} onSuccess
 * @param {number} intervalMs
 * @returns {() => void} función para cancelar el reintento en segundo plano
 */
export function backgroundRetry(taskFn, onSuccess, intervalMs = 16000) {
  let cancelled = false;

  async function attempt() {
    if (cancelled) return;
    try {
      const result = await taskFn();
      if (!cancelled) onSuccess(result);
    } catch {
      if (!cancelled) setTimeout(attempt, intervalMs);
    }
  }

  setTimeout(attempt, intervalMs);
  return () => { cancelled = true; };
}
