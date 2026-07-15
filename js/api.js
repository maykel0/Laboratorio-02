/**
 * api.js
 * ------
 * Qué hace: es el ÚNICO punto por el que toda la aplicación habla con la API
 * del Mundial 2026. Agrega el header Authorization, delega los reintentos con
 * backoff a retry.js, guarda las respuestas exitosas en cache.js y traduce
 * cualquier fallo en un objeto de error consistente para que ui.js decida qué
 * mostrar.
 * Por qué existe: separación de responsabilidades — ninguna página llama a
 * fetch() directamente, así toda la resiliencia vive en un solo lugar
 * (bajo acoplamiento, alta cohesión).
 * Problema que resuelve: evita duplicar la lógica de headers/errores/caché
 * en cada una de las 5 páginas de datos.
 */

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config.js';
import { getToken, clearSession } from './auth.js';
import { retryFetch } from './retry.js';
import { setCache, getCache } from './cache.js';

/**
 * Modo de demostración de resiliencia (ver ui.js / dashboard.js).
 * Permite forzar, desde un panel visible en el dashboard, que la PRÓXIMA
 * petición se comporte como si la API hubiera devuelto un código de error
 * específico (o un timeout / error de red). Esto existe exclusivamente para
 * la defensa oral: la API real rara vez devuelve 401/500/503 bajo demanda,
 * y la única forma HONESTA de demostrar que el manejo de errores funciona
 * para todos los códigos exigidos es poder simularlos de forma transparente.
 * Nunca se usa para alterar datos reales, solo para forzar la RESPUESTA de
 * un intento de fetch.
 */
let forcedFailure = null; // ej: { status: 429 } o { status: 'network' } o { status: 'timeout' }

export function forceNextFailure(kind) {
  forcedFailure = kind;
}

export function clearForcedFailure() {
  forcedFailure = null;
}

/**
 * Realiza un fetch real con timeout, salvo que haya un fallo forzado activo
 * (modo demo), en cuyo caso simula la respuesta/​excepción correspondiente.
 */
async function performRequest(path) {
  if (forcedFailure) {
    const failure = forcedFailure;
    forcedFailure = null; // se consume una sola vez
    if (failure.status === 'network') {
      throw new TypeError('Failed to fetch (simulado)');
    }
    if (failure.status === 'timeout') {
      await new Promise((_, reject) =>
        setTimeout(() => reject(new DOMException('Timeout simulado', 'AbortError')), 300)
      );
    }
    // Respuesta HTTP simulada con el código solicitado
    return new Response(JSON.stringify({ message: `Error ${failure.status} simulado con fines académicos` }), {
      status: failure.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const token = getToken();

  try {
    return await fetch(API_BASE_URL + path, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Construye un objeto de error homogéneo que ui.js sabe interpretar.
 */
function buildApiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Traduce un código HTTP al mensaje que debe ver el usuario.
 * Cubre explícitamente los códigos exigidos por el laboratorio: 400, 401,
 * 403, 404, 429, 500, 503. La API documentada de worldcup26.ir solo emite
 * 400/401/404/429/500 en la práctica; 403 y 503 se manejan igual de forma
 * defensiva por si un proxy, CDN o una futura versión de la API los produce.
 */
function messageForStatus(status) {
  const messages = {
    400: 'La solicitud tiene datos inválidos.',
    401: 'Tu sesión ha expirado o el token no es válido.',
    403: 'No tienes permiso para acceder a este recurso.',
    404: 'El recurso solicitado no existe.',
    429: 'Se alcanzó el límite de solicitudes. Reintentando automáticamente…',
    500: 'Error interno del servidor. Reintentando automáticamente…',
    503: 'El servicio no está disponible temporalmente. Reintentando…',
  };
  return messages[status] || `Error inesperado (código ${status}).`;
}

/**
 * Punto de entrada principal usado por todas las páginas.
 *
 * @param {string} cacheKey - clave lógica para cache.js (ej: "games")
 * @param {string} path - ruta relativa de la API (ej: "/get/games")
 * @param {object} [options]
 * @param {HTMLElement} [options.counterEl] - elemento para el contador de reintentos (429)
 * @param {(attempt:number, status:number|string) => void} [options.onRetry]
 * @returns {Promise<{data:any, fromCache:boolean, cacheTimestamp:number|null}>}
 */
export async function apiFetch(cacheKey, path, options = {}) {
  try {
    const response = await retryFetch(() => performRequest(path), {
      counterEl: options.counterEl,
      onRetry: options.onRetry,
    });

    if (response.ok) {
      const data = await response.json();
      setCache(cacheKey, data);
      return { data, fromCache: false, cacheTimestamp: null };
    }

    // 401: la sesión ya no es válida. Se limpia aquí mismo para que
    // CUALQUIER llamada a la API dispare el mismo comportamiento,
    // sin depender de que cada página recuerde hacerlo.
    if (response.status === 401) {
      clearSession();
    }

    throw buildApiError(response.status, messageForStatus(response.status));
  } catch (err) {
    // Error de red (sin conexión, CORS, DNS) o timeout (AbortError)
    if (!err.status) {
      const isTimeout = err.name === 'AbortError';
      err.status = isTimeout ? 'timeout' : 'network';
      err.message = isTimeout
        ? 'La solicitud tardó demasiado (timeout).'
        : 'No se pudo conectar con el servidor.';
    }

    // Degradación elegante: si hay una copia en caché, se devuelve marcada
    // como tal en vez de dejar la interfaz vacía o romper la página.
    const cached = getCache(cacheKey);
    if (cached) {
      return { data: cached.data, fromCache: true, cacheTimestamp: cached.timestamp, error: err };
    }

    // Sin red y sin caché: no hay nada que mostrar, se propaga el error
    // para que la página pinte un estado vacío/error explícito.
    throw err;
  }
}
