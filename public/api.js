import { parseCourtAvailability } from './parser.js';
import { formatDate, generateTimeSlotsForDate } from './utils.js';

// Get the Cloudflare Worker URL from environment or use default
const WORKER_URL = 'https://itec-cors-proxy.adiel-bm5.workers.dev';

/**
 * Authentication service
 */
class AuthService {
  constructor() {
    this.sessionId = null;
    this.authenticityToken = null;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return this.sessionId !== null && this.authenticityToken !== null;
  }

  /**
   * Extract authenticity token from HTML page
   */
  extractAuthenticityToken(html) {
    const match = html.match(/name="authenticity_token"\s+value="([^"]+)"/);
    return match ? match[1] : null;
  }

  /**
   * Extract session cookie from custom header
   */
  extractSessionCookie(sessionCookieHeader) {
    if (!sessionCookieHeader) return null;
    return sessionCookieHeader;
  }

  /**
   * Get authenticity token from the login page
   */
  async getAuthenticityTokenFromLoginPage() {
    try {
      const headers = {};
      if (this.sessionId && this.sessionId !== 'browser-managed') {
        headers['X-Session-Cookie'] = this.sessionId;
      }
      
      const response = await fetch(`${WORKER_URL}/proxy/self_services/login`, {
        headers,
      });
      const html = await response.text();
      return this.extractAuthenticityToken(html);
    } catch (error) {
      console.error('Error fetching login page:', error);
      return null;
    }
  }

  /**
   * Perform login and get auth tokens
   */
  async login(email, userId) {
    try {
      // First, get the authenticity token from the login page
      const authenticityToken = await this.getAuthenticityTokenFromLoginPage();
      if (!authenticityToken) {
        throw new Error('Failed to get authenticity token');
      }

      // Prepare form data
      const formData = new URLSearchParams();
      formData.append('utf8', '✓');
      formData.append('authenticity_token', authenticityToken);
      formData.append('login', email);
      formData.append('p_id', userId);

      // Perform login
      const response = await fetch(`${WORKER_URL}/proxy/self_services/login.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const responseText = await response.text();
      
      // Check if login was successful by looking for the redirect in the response
      if (!responseText.includes('window.location.href') && !response.ok) {
        throw new Error('Login failed - invalid credentials');
      }

      // Extract session cookie from custom header
      const sessionCookie = response.headers.get('X-Session-Cookie');
      if (!sessionCookie) {
        throw new Error('Failed to get session cookie from login response');
      }

      // Store the session cookie temporarily
      this.sessionId = sessionCookie;

      // Get a fresh authenticity token for subsequent requests
      const courtInvitationResponse = await fetch(`${WORKER_URL}/proxy/self_services/court_invitation`, {
        headers: {
          'X-Session-Cookie': this.sessionId,
        },
      });

      if (!courtInvitationResponse.ok) {
        throw new Error('Failed to verify authentication');
      }

      const html = await courtInvitationResponse.text();
      
      // If the page redirects to login, authentication failed
      if (html.includes('window.location.href') && html.includes('/login')) {
        throw new Error('Authentication verification failed');
      }
      
      const newAuthenticityToken = this.extractAuthenticityToken(html);

      if (!newAuthenticityToken) {
        throw new Error('Failed to get authenticity token after login');
      }

      this.authenticityToken = newAuthenticityToken;

      // Store credentials in localStorage
      this.saveToStorage();

      return true;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Save auth tokens to localStorage
   */
  saveToStorage() {
    localStorage.setItem('sessionId', this.sessionId);
    localStorage.setItem('authenticityToken', this.authenticityToken);
  }

  /**
   * Load auth tokens from localStorage
   */
  loadFromStorage() {
    this.sessionId = localStorage.getItem('sessionId');
    this.authenticityToken = localStorage.getItem('authenticityToken');
    return this.isAuthenticated();
  }

  /**
   * Clear auth tokens
   */
  logout() {
    this.sessionId = null;
    this.authenticityToken = null;
    localStorage.removeItem('sessionId');
    localStorage.removeItem('authenticityToken');
  }

  /**
   * Get current auth tokens
   */
  getTokens() {
    return {
      sessionId: this.sessionId,
      authenticityToken: this.authenticityToken,
    };
  }
}

/**
 * API service for court operations
 */
class APIService {
  constructor(authService) {
    this.authService = authService;
  }

  /**
   * Fetch available time slots for a specific unit and date
   */
  async fetchTimeSlots(unitId, date) {
    try {
      const tokens = this.authService.getTokens();
      if (!tokens.sessionId) {
        throw new Error('Not authenticated');
      }

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const formData = new URLSearchParams();
      formData.append('unit_id', unitId);
      formData.append('date', dateStr);
      formData.append('court_type', '1');

      const response = await fetch(`${WORKER_URL}/proxy/self_services/set_time_by_unit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Session-Cookie': tokens.sessionId,
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      return this.parseTimeSlots(responseText);
    } catch (error) {
      console.error('Error fetching time slots:', error);
      return [];
    }
  }

  /**
   * Parse time slots from the jQuery HTML response
   */
  parseTimeSlots(responseText) {
    const allSlots = [];
    const patterns = [
      new RegExp('value=\\\\"(\\d{2}:\\d{2})\\\\"', 'g'),
      new RegExp('value="(\\d{2}:\\d{2})"', 'g'),
      new RegExp("value='(\\d{2}:\\d{2})'", 'g'),
    ];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(responseText)) !== null) {
        const time = match[1];
        if (!allSlots.includes(time)) {
          allSlots.push(time);
        }
      }
      if (allSlots.length > 0) break;
    }

    // Filter half-hour slots
    const filteredSlots = [];
    for (const slot of allSlots) {
      if (slot.endsWith(':00')) {
        filteredSlots.push(slot);
      } else if (slot.endsWith(':30')) {
        const [hours, _] = slot.split(':');
        const nextHour = String(parseInt(hours) + 1).padStart(2, '0') + ':00';
        if (!allSlots.includes(nextHour)) {
          filteredSlots.push(slot);
        }
      }
    }

    return filteredSlots;
  }

  /**
   * Search for available courts
   */
  async searchCourts(unitId, date, startHour, duration = 1) {
    try {
      const tokens = this.authService.getTokens();
      if (!tokens.sessionId || !tokens.authenticityToken) {
        throw new Error('Not authenticated');
      }

      const formData = new URLSearchParams();
      formData.append('utf8', '✓');
      formData.append('authenticity_token', tokens.authenticityToken);
      formData.append('search[unit_id]', unitId);
      formData.append('search[court_type]', '1');
      formData.append('search[start_date]', formatDate(date));
      formData.append('search[start_hour]', startHour);
      formData.append('search[duration]', duration.toString());

      const response = await fetch(`${WORKER_URL}/proxy/self_services/search_court.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Session-Cookie': tokens.sessionId,
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      return parseCourtAvailability(responseText);
    } catch (error) {
      console.error('Error searching courts:', error);
      return null;
    }
  }

  /**
   * Search for courts across multiple time slots with rate limiting
   */
  async searchMultipleSlots(unitId, date, slots) {
    const results = new Map();

    try {
      const tokens = this.authService.getTokens();
      if (!tokens.sessionId || !tokens.authenticityToken) {
        throw new Error('Not authenticated');
      }

      const timeSlots = slots.map(slot => slot.time);
      const dateStr = formatDate(date);

      // Call the new batch endpoint
      const response = await fetch(`${WORKER_URL}/api/search-courts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Cookie': tokens.sessionId,
        },
        body: JSON.stringify({
          unitId,
          date: dateStr,
          timeSlots,
          sessionId: tokens.sessionId,
          authenticityToken: tokens.authenticityToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Convert the results object to a Map with the expected key format
      Object.entries(data.results).forEach(([timeSlot, availability]) => {
        const key = `${dateStr}_${timeSlot}`;
        results.set(key, availability);
      });

      // Log if results were cached
      if (data.cached) {
        console.log('Results retrieved from cache');
      }

      return results;
    } catch (error) {
      console.error('Error in batch search:', error);
      
      // Fallback to individual requests if batch fails
      console.log('Falling back to individual requests...');
      const batchSize = 3;
      for (let i = 0; i < slots.length; i += batchSize) {
        const batch = slots.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (slot) => {
          const key = `${formatDate(date)}_${slot.time}`;
          const availability = await this.searchCourts(unitId, date, slot.time, 1);
          return { key, availability };
        });

        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(({ key, availability }) => {
          if (availability) {
            results.set(key, availability);
          }
        });

        // Small delay between batches to be nice to the server
        if (i + batchSize < slots.length) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      return results;
    }
  }
}

export { AuthService, APIService, WORKER_URL };
