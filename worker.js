/**
 * worker.js
 * ---------
 * Proxy CORS para la API https://worldcup26.ir
 *
 * Por qué existe: worldcup26.ir no envía el header
 * "Access-Control-Allow-Origin", así que el navegador bloquea las
 * peticiones hechas directamente desde tu página en GitHub Pages.
 * Este Worker corre en la infraestructura de Cloudflare (servidor a
 * servidor, sin navegador de por medio), reenvía la petición tal cual
 * a worldcup26.ir, y devuelve la respuesta agregando los headers CORS
 * que faltan. El navegador ve una respuesta "amigable" y deja pasar
 * el fetch.
 *
 * IMPORTANTE: cambiá ALLOWED_ORIGIN por tu dominio real antes de
 * desplegar en producción. Usar "*" funciona para probar rápido, pero
 * significa que CUALQUIER sitio web podría usar tu proxy.
 */

const API_BASE_URL = 'https://worldcup26.ir';
const ALLOWED_ORIGIN = 'https://maykel0.github.io'; // <-- restringí esto a tu dominio

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // cachea el preflight 24h, menos idas y vueltas
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');
    const headers = corsHeaders(ALLOWED_ORIGIN === '*' ? '*' : ALLOWED_ORIGIN);

    // El navegador manda un preflight OPTIONS antes del POST/PUT/DELETE real.
    // Hay que responderlo directamente acá, sin reenviarlo a la API real.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    // Todo lo que venga después del dominio del worker (path + querystring)
    // se reenvía tal cual a worldcup26.ir
    const targetUrl = API_BASE_URL + url.pathname + url.search;

    try {
      const proxiedResponse = await fetch(targetUrl, {
        method: request.method,
        headers: {
          'Content-Type': request.headers.get('Content-Type') || 'application/json',
          // reenvía el JWT si la petición lo trae (para los endpoints /get/*)
          ...(request.headers.get('Authorization')
            ? { Authorization: request.headers.get('Authorization') }
            : {}),
        },
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
      });

      const responseBody = await proxiedResponse.text();

      return new Response(responseBody, {
        status: proxiedResponse.status,
        headers: {
          ...headers,
          'Content-Type': proxiedResponse.headers.get('Content-Type') || 'application/json',
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ message: 'Error al contactar la API real', detail: String(err) }),
        { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }
  },
};
