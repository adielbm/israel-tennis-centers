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

// Cache TTL in seconds (10 minutes)
const CACHE_TTL = 600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS preflight request
    if (request.method === 'OPTIONS') {
      return handleCORS(env);
    }
    
    // Only allow requests from the GitHub Pages origin
    const origin = request.headers.get('Origin');
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://adielbm.github.io';
    
    if (origin && origin !== allowedOrigin) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // Handle batch court search endpoint
    if (url.pathname === '/api/search-courts' && request.method === 'POST') {
      return handleBatchCourtSearch(request, env, allowedOrigin);
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
function handleCORS(env) {
  const allowedOrigin = env?.ALLOWED_ORIGIN || 'https://adielbm.github.io';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session-Cookie, X-Auth-Token',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Handle batch court search request
 */
async function handleBatchCourtSearch(request, env, allowedOrigin) {
  try {
    const body = await request.json();
    const { unitId, date, timeSlots, sessionId, authenticityToken } = body;
    
    if (!unitId || !date || !timeSlots || !sessionId || !authenticityToken) {
      return jsonResponse(
        { error: 'Missing required parameters: unitId, date, timeSlots, sessionId, authenticityToken' },
        { status: 400, allowedOrigin }
      );
    }
    
    // Check cache first (if KV is available)
    const cacheKey = `courts:${unitId}:${date}`;
    if (env.COURTS_CACHE) {
      const cached = await env.COURTS_CACHE.get(cacheKey, 'json');
      if (cached) {
        console.log(`Cache hit for ${cacheKey}`);
        return jsonResponse(
          { ...cached, cached: true },
          { allowedOrigin }
        );
      }
    }
    
    // Fetch court availability for all time slots
    const results = {};
    const targetBaseUrl = env.TARGET_BASE_URL || 'https://center.tennis.org.il';
    
    // Process slots in batches to avoid overwhelming the server
    const batchSize = 3;
    for (let i = 0; i < timeSlots.length; i += batchSize) {
      const batch = timeSlots.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (timeSlot) => {
        const formData = new URLSearchParams();
        formData.append('utf8', '✓');
        formData.append('authenticity_token', authenticityToken);
        formData.append('search[unit_id]', unitId);
        formData.append('search[court_type]', '1');
        formData.append('search[start_date]', date);
        formData.append('search[start_hour]', timeSlot);
        formData.append('search[duration]', '1');
        
        const response = await fetch(`${targetBaseUrl}/self_services/search_court.js`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': sessionId,
          },
          body: formData.toString(),
        });
        
        if (!response.ok) {
          return { timeSlot, error: `HTTP ${response.status}` };
        }
        
        const responseText = await response.text();
        const availability = parseCourtAvailability(responseText);
        
        return { timeSlot, availability };
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      batchResults.forEach(({ timeSlot, availability, error }) => {
        if (error) {
          results[timeSlot] = { status: 'error', error };
        } else {
          results[timeSlot] = availability;
        }
      });
      
      // Small delay between batches
      if (i + batchSize < timeSlots.length) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    
    const responseData = {
      unitId,
      date,
      results,
      cached: false
    };
    
    // Store in cache (if KV is available)
    if (env.COURTS_CACHE) {
      await env.COURTS_CACHE.put(
        cacheKey,
        JSON.stringify(responseData),
        { expirationTtl: CACHE_TTL }
      );
      console.log(`Cached results for ${cacheKey}`);
    }
    
    return jsonResponse(responseData, { allowedOrigin });
  } catch (error) {
    console.error('Batch search error:', error);
    return jsonResponse(
      { error: `Batch search error: ${error.message}` },
      { status: 500, allowedOrigin }
    );
  }
}

/**
 * Parse court availability from HTML response
 */
function parseCourtAvailability(response) {
  const html = extractHtmlFromResponse(response);

  if (isNoCourtsAvailable(html)) {
    const suggestedTimes = parseSuggestedTimes(html);
    return {
      status: "no-courts",
      courts: [],
      slots: [],
      suggestedTimes: suggestedTimes.length > 0 ? suggestedTimes : undefined,
    };
  }

  const slots = parseCourtSlots(html);
  const courts = [...new Set(slots.map((s) => s.courtNumber))].sort((a, b) => a - b);

  if (slots.length === 0) {
    return {
      status: "no-courts",
      courts: [],
      slots: [],
    };
  }

  return {
    status: "available",
    courts,
    slots,
  };
}

/**
 * Check if the response indicates no courts available
 */
function isNoCourtsAvailable(html) {
  if (html.includes("alert-success")) {
    return false;
  }
  return html.includes("מועדים אחרים") || html.includes("alert-danger") || html.includes("נסה מועד אחר");
}

/**
 * Parse court slots from HTML response
 */
function parseCourtSlots(html) {
  const slots = [];
  const rowRegex = /מגרש:\s*(\d+)[\s\S]*?court_id=(\d+)&amp;duration=([\d.]+)&amp;end_time=([^&]+)&amp;start_time=([^"&]+)/g;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    slots.push({
      courtNumber: parseInt(match[1], 10),
      courtId: parseInt(match[2], 10),
      duration: parseFloat(match[3]),
      endTime: decodeURIComponent(match[4].replace(/\+/g, " ")),
      startTime: decodeURIComponent(match[5].replace(/\+/g, " ")),
    });
  }

  return slots;
}

/**
 * Extract HTML content from jQuery response
 */
function extractHtmlFromResponse(response) {
  const match = response.match(/jQuery\('#step-2'\)\.html\('([\s\S]*?)'\);/);
  
  if (!match) return "";
  
  return match[1]
    .replace(/\\n/g, "")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/");
}

/**
 * Parse suggested alternative times from "no courts available" response
 */
function parseSuggestedTimes(html) {
  const times = [];
  const timeRegex = /<h3>(\d{2}:\d{2})-\d{2}:\d{2}<\/h3>/g;
  
  let match;
  while ((match = timeRegex.exec(html)) !== null) {
    const startTime = match[1];
    if (!times.includes(startTime)) {
      times.push(startTime);
    }
  }
  
  return times;
}

/**
 * Create JSON response with CORS headers
 */
function jsonResponse(data, options = {}) {
  const { status = 200, allowedOrigin = 'https://adielbm.github.io' } = options;
  
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session-Cookie, X-Auth-Token',
      'Access-Control-Expose-Headers': 'X-Session-Cookie',
    },
  });
}
