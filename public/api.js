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
   * Extract session ID from Set-Cookie header
   */
  extractSessionId(setCookieHeader) {
    if (!setCookieHeader) return null;
    const match = setCookieHeader.match(/_session_id=([^;]+)/);
    return match ? match[1] : null;
  }

  /**
   * Get authenticity token from the login page
   */
  async getAuthenticityTokenFromLoginPage() {
    try {
      const response = await fetch(`${WORKER_URL}/proxy/self_services/login`);
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

      // Extract session ID from cookies
      const setCookie = response.headers.get('set-cookie');
      const sessionId = this.extractSessionId(setCookie);

      if (!sessionId) {
        throw new Error('Failed to get session ID from login response');
      }

      // Get a fresh authenticity token for subsequent requests
      const courtInvitationResponse = await fetch(`${WORKER_URL}/proxy/self_services/court_invitation`, {
        headers: {
          'Cookie': `_session_id=${sessionId}`,
        },
      });

      const html = await courtInvitationResponse.text();
      const newAuthenticityToken = this.extractAuthenticityToken(html);

      this.sessionId = sessionId;
      this.authenticityToken = newAuthenticityToken || authenticityToken;

      // Store credentials in localStorage
      this.saveToStorage();

      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
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
          'Cookie': `_session_id=${tokens.sessionId}`,
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
          'Cookie': `_session_id=${tokens.sessionId}`,
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

    // Process slots in batches of 3 with delays to avoid overwhelming the server
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

export { AuthService, APIService, WORKER_URL };
