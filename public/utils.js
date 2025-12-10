/**
 * Date and time utilities
 */

/**
 * Format date for ITEC API (dd/MM/yyyy)
 */
export function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Get day of week (0 = Sunday, 6 = Saturday)
 */
export function getDayOfWeek(date) {
  return date.getDay();
}

/**
 * Get valid time slots based on day of week
 * Sun-Thu: 8:00-22:00
 * Fri: 7:00-16:00
 * Sat: 7:00-12:00, 16:00-21:00
 */
export function getValidTimeSlots(date) {
  const dayOfWeek = getDayOfWeek(date);
  const slots = [];

  if (dayOfWeek >= 0 && dayOfWeek <= 4) {
    // Sunday to Thursday: 8:00-22:00
    for (let hour = 8; hour <= 22; hour++) {
      slots.push(`${String(hour).padStart(2, "0")}:00`);
    }
  } else if (dayOfWeek === 5) {
    // Friday: 7:00-16:00
    for (let hour = 7; hour <= 16; hour++) {
      slots.push(`${String(hour).padStart(2, "0")}:00`);
    }
  } else if (dayOfWeek === 6) {
    // Saturday: 7:00-12:00, 16:00-21:00
    for (let hour = 7; hour <= 12; hour++) {
      slots.push(`${String(hour).padStart(2, "0")}:00`);
    }
    for (let hour = 16; hour <= 21; hour++) {
      slots.push(`${String(hour).padStart(2, "0")}:00`);
    }
  }

  return slots;
}

/**
 * Get start of today at midnight
 */
export function getToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Generate array of dates for next N days starting from a given date
 */
export function getNextDays(startDate, days) {
  const dates = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
}

/**
 * Format date for display with day name
 */
export function formatDateDisplay(date) {
  const dayName = getWeekday(date);
  const dateStr = formatDate(date);
  const dateStrAndName = `${dayName}, ${dateStr}`;

  // if today or tomorrow, add prefix
  if (date.toDateString() === getToday().toDateString()) {
    return `היום,  ${dateStrAndName}`;
  }
  const tomorrow = new Date(getToday());
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) {
    return `מחר, ${dateStrAndName}`;
  }

  return dateStrAndName;
}

/**
 * Get weekday name in English (short)
 */
export function getWeekday(date) {
  const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  return days[date.getDay()];
}

export function getShortWeekday(date) {
  const days = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  return days[date.getDay()];
}

/**
 * Generate time slots for a specific date starting from current hour if it's today
 * Can accept custom time slots from the API or use default slots
 * Filters to show half-hour slots only when the next full hour is not available
 */
export function generateTimeSlotsForDate(date, availableTimeSlots) {
  const slots = [];
  const validSlots = availableTimeSlots || getValidTimeSlots(date);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const currentHour = now.getHours();

  // Filter slots if it's today
  let slotsToInclude = isToday 
    ? validSlots.filter((slot) => parseInt(slot.split(":")[0]) > currentHour)
    : validSlots;

  // Filter: include half-hour slots only if the next full hour is not available
  slotsToInclude = slotsToInclude.filter((slot) => {
    if (slot.endsWith(':00')) {
      return true;
    } else if (slot.endsWith(':30')) {
      const [hours, _] = slot.split(':');
      const nextHour = String(parseInt(hours) + 1).padStart(2, '0') + ':00';
      return !slotsToInclude.includes(nextHour);
    }
    return true;
  });

  for (const time of slotsToInclude) {
    slots.push({ date: new Date(date), time });
  }

  return slots;
}
