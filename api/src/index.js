/**
 * Cloudflare Worker - CORS Proxy for Israel Tennis Centers
 * 
 * This worker acts as a proxy to overcome CORS restrictions when accessing
 * center.tennis.org.il from the GitHub Pages frontend.
 */

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
    
    // Build the target URL
    const targetBaseUrl = env.TARGET_BASE_URL || 'https://center.tennis.org.il';
    const targetUrl = `${targetBaseUrl}${path}${url.search}`;
    
    try {
      // Forward the request to the target server
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : null,
      });
      
      // Remove origin header to avoid CORS issues with the target server
      proxyRequest.headers.delete('Origin');
      
      // Make the request
      const response = await fetch(proxyRequest);
      
      // Create a new response with CORS headers
      const newResponse = new Response(response.body, response);
      
      // Add CORS headers
      newResponse.headers.set('Access-Control-Allow-Origin', allowedOrigin);
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Cookie, Set-Cookie');
      newResponse.headers.set('Access-Control-Expose-Headers', 'Set-Cookie');
      newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
      
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
      'Access-Control-Allow-Headers': 'Content-Type, Cookie, Set-Cookie',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}
