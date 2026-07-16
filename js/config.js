/**
 * config.js
 * ---------
 * Única fuente de verdad para la configuración de la API.
 * ¿Por qué existe? Si la URL base o un endpoint cambia, se edita en UN solo
 * lugar en vez de buscar strings repetidos por todo el proyecto (DRY / bajo acoplamiento).
 */

// URL base de la API pública del Mundial 2026 (ver https://worldcup26.ir/api-docs)
export const API_BASE_URL = 'https://worldcup26-proxy.maykel0.workers.dev';

// Endpoints de autenticación (NO requieren JWT, son los que lo generan)
export const AUTH_ENDPOINTS = {
  register: '/auth/register',
  login: '/auth/authenticate',
};

// Endpoints de datos (SÍ requieren JWT en el header Authorization)
export const DATA_ENDPOINTS = {
  games: '/get/games',
  game: (id) => `/get/game/${id}`,
  teams: '/get/teams',
  teamsByGroup: (group) => `/get/teams/?group=${encodeURIComponent(group)}`,
  team: (id) => `/get/team/${id}`,
  groups: '/get/groups',
  group: (id) => `/get/group/${id}`,
  stadiums: '/get/stadiums',
};

// Configuración del sistema de reintentos (backoff exponencial)
// Requisito del laboratorio: 1s, 2s, 4s, 8s, 16s
export const RETRY_CONFIG = {
  baseDelayMs: 1000,
  maxRetries: 5,
  retryableStatusCodes: [429, 500, 503],
};

// Tiempo máximo de espera antes de considerar una petición como "timeout"
export const REQUEST_TIMEOUT_MS = 10000;

// Prefijo usado para todas las claves de caché en localStorage
export const CACHE_PREFIX = 'wc26_cache_';

// Clave de localStorage donde se guarda la sesión (token + datos de usuario)
export const SESSION_KEY = 'wc26_session';
