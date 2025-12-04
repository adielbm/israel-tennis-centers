/**
 * Cloudflare Worker - CORS Proxy for Israel Tennis Centers
 * 
 * This worker acts as a proxy to overcome CORS restrictions when accessing
 * center.tennis.org.il from the GitHub Pages frontend.
 * It also manages session cookies server-side since cross-origin cookie sharing
 * is blocked by browsers.
 */

// Whitelist of allowed paths
const ALLOWED_PATHS = [
  '/self_services/login',
  '/self_services/login.js',
  '/self_services/court_invitation',
  '/self_services/set_time_by_unit',
  '/self_services/search_court.js'
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS preflight request
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }
    
    // Only allow requests from the GitHub Pages origin
    const origin = request.headers.get('Origin');
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://adielbm.github.io';
    
    if (origin && origin !== allowedOrigin) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // Extract the path after /proxy/
    const path = url.pathname.replace(/^\/proxy/, '');
    
    if (!path) {
      return new Response('Bad Request: Missing path', { status: 400 });
    }
    
    // Check if path is allowed
    if (!ALLOWED_PATHS.includes(path)) {
      return new Response('Forbidden: Path not allowed', { status: 403 });
    }
    
    // Build the target URL
    const targetBaseUrl = env.TARGET_BASE_URL || 'https://center.tennis.org.il';
    const targetUrl = `${targetBaseUrl}${path}${url.search}`;
    
    try {
      // Get the session cookie from the client's request (if any)
      const clientSessionCookie = request.headers.get('X-Session-Cookie');
      
      // Create headers for the target request
      const targetHeaders = new Headers();
      
      // Copy relevant headers
      for (const [key, value] of request.headers.entries()) {
        if (key.toLowerCase() !== 'origin' && 
            key.toLowerCase() !== 'host' &&
            key.toLowerCase() !== 'x-session-cookie') {
          targetHeaders.set(key, value);
        }
      }
      
      // If client provided a session cookie, use it
      if (clientSessionCookie) {
        targetHeaders.set('Cookie', clientSessionCookie);
      }
      
      // Forward the request to the target server
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: targetHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : null,
      });
      
      // Make the request
      const response = await fetch(proxyRequest);
      
      // Extract any Set-Cookie headers from the response
      const setCookieHeaders = response.headers.get('set-cookie');
      
      // Create response headers
      const responseHeaders = new Headers();
      
      // Copy response headers except Set-Cookie
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() !== 'set-cookie') {
          responseHeaders.set(key, value);
        }
      }
      
      // Add CORS headers
      responseHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-Session-Cookie');
      responseHeaders.set('Access-Control-Expose-Headers', 'X-Session-Cookie');
      
      // If the server set cookies, send them back in a custom header
      // that JavaScript can read
      if (setCookieHeaders) {
        // Extract just the session ID cookie
        const sessionMatch = setCookieHeaders.match(/_session_id=([^;]+)/);
        if (sessionMatch) {
          responseHeaders.set('X-Session-Cookie', `_session_id=${sessionMatch[1]}`);
        }
      }
      
      // Create a new response
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
      
      return newResponse;
    } catch (error) {
      console.error('Proxy error:', error);
      return new Response(`Proxy Error: ${error.message}`, { status: 500 });
    }
  }
};

/**
 * Handle CORS preflight requests
 */
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://adielbm.github.io',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session-Cookie',
      'Access-Control-Max-Age': '86400',
    },
  });
}
