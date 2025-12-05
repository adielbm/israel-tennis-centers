import { AuthService, APIService } from './api.js';
import { getToday, getNextDays, formatDateDisplay, generateTimeSlotsForDate, formatDate, getWeekday } from './utils.js';
import { TENNIS_CENTERS } from './constants.js';

// Initialize services
const authService = new AuthService();
const apiService = new APIService(authService);

// State
let currentScreen = 'login';
let credentials = null;
let selectedDate = null;

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/**
 * Navigate to a screen
 */
function navigateToScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
  currentScreen = screenId;
}

/**
 * Handle login
 */
async function handleLogin(e) {
  e.preventDefault();
  
  let email = document.getElementById('email').value;
  let userId = document.getElementById('user-id').value;
  const tennisCenter = document.getElementById('tennis-center-city').value;

  // Validate inputs
  if (!email || !userId) {
    showToast('יש למלא את כל השדות', 'error');
    return;
  }

  // trim inputs
  email = email.trim();
  userId = userId.trim();
  
  // Validate tennis center is selected
  if (!tennisCenter) {
    showToast('יש לבחור מרכז טניס', 'error');
    return;
  }
  
  // Store credentials
  credentials = { email, userId, tennisCenter };
  localStorage.setItem('credentials', JSON.stringify(credentials));
  
  showToast('מתחבר...', 'info');
  
  try {
    await authService.login(email, userId);
    showToast('התחברת בהצלחה!', 'success');
    showDateSelection();
  } catch (error) {
    console.error('Login failed:', error);
    showToast(`התחברות נכשלה: ${error.message}`, 'error');
  }
}

/**
 * Show date selection screen
 */
function showDateSelection() {
  navigateToScreen('date-screen');
  
  const dateList = document.getElementById('date-list');
  dateList.innerHTML = '';
  const today = getToday();

  // Determine start of week (Sunday) for current week
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  // Build 2 weeks (14 days) starting from startOfWeek
  const dates = getNextDays(startOfWeek, 14);

  // Create weekday header
  const weekdaysRow = document.createElement('div');
  weekdaysRow.className = 'weekdays';
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const weekdayCell = document.createElement('div');
    weekdayCell.className = 'weekday';
    weekdayCell.textContent = getWeekday(d);
    weekdaysRow.appendChild(weekdayCell);
  }
  dateList.appendChild(weekdaysRow);

  // Create two week rows of date cells
  for (let week = 0; week < 2; week++) {
    const weekRow = document.createElement('div');
    weekRow.className = 'date-grid';
    for (let day = 0; day < 7; day++) {
      const idx = week * 7 + day;
      const date = dates[idx];
      const dateCell = document.createElement('button');
      dateCell.className = 'date-cell';
      const label = formatDate(date).split('/')[0]; // day number
      const weekdayLabel = getWeekday(date);

      // Mark today
      if (date.toDateString() === today.toDateString()) {
        dateCell.classList.add('today');
      }

      dateCell.innerHTML = `
        <div class="date-day">${label}</div>
        <div class="date-weekday">${weekdayLabel}</div>
      `;

      dateCell.addEventListener('click', () => {
        // remove previous selection
        document.querySelectorAll('.date-cell.selected').forEach(el => el.classList.remove('selected'));
        dateCell.classList.add('selected');
        showCourts(date);
      });

      weekRow.appendChild(dateCell);
    }
    dateList.appendChild(weekRow);
  }
}

/**
 * Show courts for selected date
 */
async function showCourts(date) {
  selectedDate = date;
  navigateToScreen('courts-screen');
  
  document.getElementById('selected-date-title').textContent = formatDateDisplay(date);
  document.getElementById('loading-message').style.display = 'block';
  document.getElementById('courts-list').innerHTML = '';
  
  try {
    // Fetch available time slots from API
    const availableTimeSlots = await apiService.fetchTimeSlots(credentials.tennisCenter, date);
    
    // Generate time slots for display
    const slots = generateTimeSlotsForDate(date, availableTimeSlots);
    
    if (slots.length === 0) {
      document.getElementById('loading-message').style.display = 'none';
      document.getElementById('courts-list').innerHTML = `
        <div class="empty-state">
          <h3>אין מגרשים זמינים</h3>
          <p>יש לנסות תאריך אחר.</p>
        </div>
      `;
      return;
    }
    
    // Search for court availability for all slots
    showToast(`בודק ${slots.length} מגרשים...`, 'info');
    console.log('Searching for courts with:', { tennisCenter: credentials.tennisCenter, date, slotsCount: slots.length });
    const results = await apiService.searchMultipleSlots(credentials.tennisCenter, date, slots);
    
    console.log('Search completed. Results:', results);
    
    document.getElementById('loading-message').style.display = 'none';
    
    // Render results
    renderCourtsResults(slots, results, date);
    
    const availableCount = Array.from(results.values()).filter(r => r.status === 'available').length;
    if (availableCount > 0) {
      // Show reservation link
      const reservationLink = document.getElementById('reservation-link');
      reservationLink.style.display = 'inline-block';
      reservationLink.style.marginTop = '30px';
    } else {
      showToast('לא נמצאו מגרשים פנויים', 'info');
    }
  } catch (error) {
    console.error('Error fetching courts:', error);
    document.getElementById('loading-message').style.display = 'none';
    showToast('שגיאה בטעינת המגרשים', 'error');
  }
}

/**
 * Render courts results
 */
function renderCourtsResults(slots, results, date) {
  console.log('=== Rendering Courts Results ===');
  console.log('Total slots to render:', slots.length);
  console.log('Results map size:', results.size);
  console.log('Results keys:', Array.from(results.keys()));
  
  const courtsList = document.getElementById('courts-list');
  courtsList.innerHTML = '';
  
  slots.forEach((slot) => {
    // Use formatDate to match the key format used in searchMultipleSlots
    const formattedDate = formatDate(slot.date);
    const key = `${formattedDate}_${slot.time}`;
    const result = results.get(key);
    
    console.log(`Slot ${slot.time}: key="${key}", found=${!!result}`);
    
    if (!result) {
      console.warn(`No result found for slot ${slot.time} with key ${key}`);
      return;
    }
    
    const isAvailable = result.status === 'available';
    
    const timeSlot = document.createElement('div');
    timeSlot.className = `time-slot ${isAvailable ? 'available' : 'unavailable'}`;
    
    const courtsInfo = isAvailable 
      ? `${result.courts.length} מגרש${result.courts.length > 1 ? 'ים' : ''} פנוי${result.courts.length > 1 ? 'ים' : ''}`
      : 'תפוס';
    
    const courtTags = isAvailable 
      ? result.courts.map(num => `<span class="court-tag">${num}</span>`).join('')
      : '';
    
    timeSlot.innerHTML = `
      <div class="time-slot-header">
        <div class="time-label">${slot.time}</div>
      </div>
      <div class="status-badge ${isAvailable ? 'available' : 'unavailable'}">${courtsInfo}</div>
      ${courtTags ? `<div class="court-tags">${courtTags}</div>` : ''}
    `;
    
    courtsList.appendChild(timeSlot);
  });
}

/**
 * Handle logout
 */
function handleLogout() {
  authService.logout();
  localStorage.removeItem('credentials');
  credentials = null;
  document.getElementById('login-form').reset();
  navigateToScreen('login-screen');
  showToast('התנתקת בהצלחה', 'success');
}

/**
 * Handle back button
 */
function handleBack() {
  showDateSelection();
}

/**
 * Update tennis center city display
 */
function updateTennisCenterDisplay(tennisCenterId) {
  const displayElement = document.getElementById('tennis-center-city');
  if (displayElement) {
    displayElement.value = tennisCenterId;
  }
}

/**
 * Initialize app
 */
function init() {
  // Check if already logged in
  const storedCredentials = localStorage.getItem('credentials');
  if (storedCredentials && authService.loadFromStorage()) {
    credentials = JSON.parse(storedCredentials);
    updateTennisCenterDisplay(credentials.tennisCenter);
    showDateSelection();
  }
  
  // Event listeners
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('back-btn').addEventListener('click', handleBack);
  
  // Tennis center selector change handler
  document.getElementById('tennis-center-city').addEventListener('change', function(e) {
    if (e.target.value && credentials) {
      credentials.tennisCenter = e.target.value;
      localStorage.setItem('credentials', JSON.stringify(credentials));
      showToast('מרכז הטניס עודכן', 'success');
      // Reload current screen if on date selection or courts
      if (currentScreen === 'date-screen') {
        showDateSelection();
      } else if (currentScreen === 'courts-screen' && selectedDate) {
        showCourts(selectedDate);
      }
    }
  });
}

// Start the app
init();
