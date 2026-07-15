/**
 * cache.js
 * --------
 * Qué hace: guarda y recupera respuestas exitosas de la API en localStorage.
 * Por qué existe: el requisito #6 exige que si una petición falla, la app
 * pueda mostrar la última copia buena conocida en vez de dejar la pantalla vacía.
 * Problema que resuelve: la app nunca debe "romperse" por falta de datos frescos.
 */

import { CACHE_PREFIX } from './config.js';

/**
 * Guarda datos exitosos en caché junto con un timestamp.
 * @param {string} key - identificador lógico (ej: "games", "teams")
 * @param {any} data - payload ya parseado (JSON)
 */
export function setCache(key, data) {
  try {
    const record = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(record));
  } catch (err) {
    // Si localStorage está lleno o no disponible, no debe romper la app:
    // simplemente no habrá caché disponible para ese endpoint.
    console.warn('No se pudo escribir en caché:', key, err);
  }
}

/**
 * Recupera datos cacheados, si existen.
 * @param {string} key
 * @returns {{data:any, timestamp:number}|null}
 */
export function getCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('No se pudo leer la caché:', key, err);
    return null;
  }
}

/**
 * Da formato legible a la antigüedad de una copia cacheada.
 * Se usa en la UI para el aviso "datos cacheados hace X".
 */
export function formatCacheAge(timestamp) {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'hace instantes';
  if (diffMin === 1) return 'hace 1 minuto';
  if (diffMin < 60) return `hace ${diffMin} minutos`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs === 1) return 'hace 1 hora';
  return `hace ${diffHrs} horas`;
}

/**
 * Elimina toda la caché de la aplicación (útil para "reset" manual).
 */
export function clearAllCache() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(CACHE_PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}
