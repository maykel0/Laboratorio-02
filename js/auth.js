/**
 * auth.js
 * -------
 * Qué hace: gestiona el ciclo de vida completo de la sesión JWT contra la API real
 * (POST /auth/register y POST /auth/authenticate). Guarda el token en localStorage,
 * lo expone para que api.js lo adjunte en cada petición, y decide cuándo la sesión
 * debe considerarse expirada.
 * Por qué existe: requisito #1 (autenticación JWT) y #4 (manejo del 401).
 * Problema que resuelve: centraliza TODO lo relacionado a la sesión en un solo
 * archivo, para que ninguna otra parte del código manipule el token directamente.
 */

import { API_BASE_URL, AUTH_ENDPOINTS, SESSION_KEY, REQUEST_TIMEOUT_MS } from './config.js';

/**
 * Traduce una excepción de fetch (TypeError de red/CORS, o AbortError de
 * timeout) a un mensaje específico para el usuario, y deja el error original
 * en consola para que se pueda diagnosticar en DevTools sin adivinar.
 */
function describeNetworkFailure(err) {
  console.error('Fallo de red en auth.js:', err);
  if (err.name === 'AbortError') {
    return `El servidor no respondió a tiempo (más de ${REQUEST_TIMEOUT_MS / 1000}s). Puede estar caído o muy lento en este momento.`;
  }
  // Un TypeError "Failed to fetch" casi siempre es CORS (bloqueo del navegador)
  // o ausencia total de red. Revisa la pestaña Network de DevTools: si la
  // petición aparece marcada como bloqueada por CORS, no hay solución
  // puramente client-side — se necesitaría un proxy o que el servidor
  // habilite tu origen.
  return 'No se pudo contactar al servidor. Revisa la pestaña "Network" de DevTools: si dice "CORS" o "blocked", es el servidor rechazando tu origen; si no aparece la petición, probablemente abriste el archivo con file:// en vez de un servidor local.';
}
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Registra un nuevo usuario en la API y guarda la sesión resultante.
 * @throws {Error} con un campo .status si la API responde con error controlado
 */
export async function register({ name, email, password }) {
  let response;
  try {
    response = await fetchWithTimeout(API_BASE_URL + AUTH_ENDPOINTS.register, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
  } catch (err) {
    throw buildAuthError('network', describeNetworkFailure(err));
  }

  const body = await safeJson(response);
  if (!response.ok) {
    throw buildAuthError(response.status, body?.message || 'No se pudo completar el registro.');
  }
  saveSession(body);
  return body;
}

/**
 * Inicia sesión contra POST /auth/authenticate y guarda el token JWT.
 */
export async function login({ email, password }) {
  let response;
  try {
    response = await fetchWithTimeout(API_BASE_URL + AUTH_ENDPOINTS.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw buildAuthError('network', describeNetworkFailure(err));
  }

  const body = await safeJson(response);
  if (!response.ok) {
    throw buildAuthError(response.status, body?.message || 'Credenciales inválidas.');
  }
  saveSession(body);
  return body;
}

function buildAuthError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Persiste la sesión (token + usuario) en localStorage junto con la
 * fecha de expiración calculada a partir del propio JWT.
 */
function saveSession({ token, user }) {
  const payload = decodeJwtPayload(token);
  const expiresAt = payload?.exp ? payload.exp * 1000 : Date.now() + 84 * 24 * 60 * 60 * 1000;
  const session = { token, user, expiresAt };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Decodifica la parte "payload" de un JWT (sin verificar la firma: eso solo
 * lo puede hacer el servidor). Se usa únicamente para leer el claim "exp"
 * y así saber, en el cliente, cuándo el token debería expirar.
 */
function decodeJwtPayload(token) {
  try {
    const [, payloadB64] = token.split('.');
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Devuelve la sesión guardada o null si no existe. */
export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Devuelve solo el token JWT actual, o null. */
export function getToken() {
  return getSession()?.token || null;
}

/**
 * true si existe un token y su claim "exp" (o el guardado) todavía no venció.
 * Esto permite detectar expiración proactivamente en el cliente, sin esperar
 * a que la API responda 401.
 */
export function isAuthenticated() {
  const session = getSession();
  if (!session || !session.token) return false;
  if (session.expiresAt && Date.now() > session.expiresAt) return false;
  return true;
}

/**
 * Limpia completamente la sesión. Se llama tanto en logout manual
 * como automáticamente cuando la API responde 401.
 */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Debe llamarse al cargar CUALQUIER página protegida (todas menos index.html).
 * Si no hay sesión válida, redirige al login.
 * Esta es la ÚNICA forma de navegación forzada que usamos: un enlace normal,
 * nunca location.reload().
 */
export function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}
