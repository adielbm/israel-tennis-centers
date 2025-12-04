/**
 * HTML parsing utilities for ITEC API responses
 */

/**
 * Check if the response indicates no courts available
 */
export function isNoCourtsAvailable(html) {
  if (html.includes("alert-success")) {
    return false;
  }
  return html.includes("מועדים אחרים") || html.includes("alert-danger") || html.includes("נסה מועד אחר");
}

/**
 * Parse court slots from HTML response
 */
export function parseCourtSlots(html) {
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
export function extractHtmlFromResponse(response) {
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
export function parseSuggestedTimes(html) {
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
 * Parse the full API response and determine availability status
 */
export function parseCourtAvailability(response) {
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
