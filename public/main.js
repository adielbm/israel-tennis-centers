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
  
  // Update user email display
  const userEmailElement = document.getElementById('user-email');
  if (userEmailElement && credentials) {
    userEmailElement.textContent = credentials.email;
  }
  
  const dateList = document.getElementById('date-list');
  dateList.innerHTML = '';
  const today = getToday();

  // Get 14 days from today
  const validDates = getNextDays(today, 14);

  // Determine start of week (Sunday) for the first valid date
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  // Calculate total cells needed (from startOfWeek to last valid date)
  const lastDate = validDates[validDates.length - 1];
  const totalDays = Math.ceil((lastDate - startOfWeek) / (1000 * 60 * 60 * 24)) + 1;
  const totalCells = Math.ceil(totalDays / 7) * 7;

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

  // Create week rows with date cells
  const numWeeks = totalCells / 7;
  for (let week = 0; week < numWeeks; week++) {
    const weekRow = document.createElement('div');
    weekRow.className = 'date-grid';
    for (let day = 0; day < 7; day++) {
      const currentDate = new Date(startOfWeek);
      currentDate.setDate(startOfWeek.getDate() + week * 7 + day);
      
      const dateCell = document.createElement('button');
      dateCell.className = 'date-cell';
      
      // Check if this date is in our valid range (today or later, and within 14 days)
      const isValid = currentDate >= today && currentDate <= lastDate;
      
      if (!isValid) {
        // Empty cell for dates before today or after 14 days
        dateCell.classList.add('disabled');
        dateCell.disabled = true;
        dateCell.innerHTML = `<div class="date-day">&nbsp;</div>`;
      } else {
        const label = formatDate(currentDate).split('/')[0]; // day number

        // Mark today
        if (currentDate.toDateString() === today.toDateString()) {
          dateCell.classList.add('today');
        }

        dateCell.innerHTML = `
          <div class="date-day">${label}</div>
        `;

        dateCell.addEventListener('click', () => {
          // remove previous selection
          document.querySelectorAll('.date-cell.selected').forEach(el => el.classList.remove('selected'));
          dateCell.classList.add('selected');
          showCourts(currentDate);
        });
      }

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
    
    // Search for court availability for all slots with streaming
    console.log('Searching for courts with:', { tennisCenter: credentials.tennisCenter, date, slotsCount: slots.length });
    
    // Callback for partial results during streaming
    const onPartialResult = (results, isComplete) => {
      // Render results as they arrive
      renderCourtsResults(slots, results, date);
      
      if (isComplete) {
        console.log('Search completed. Results:', results);
        document.getElementById('loading-message').style.display = 'none';
        
        const availableCount = Array.from(results.values()).filter(r => r.status === 'available').length;
        if (availableCount > 0) {
          // Show reservation link
          const reservationLink = document.getElementById('reservation-link');
          reservationLink.style.display = 'inline-block';
          reservationLink.style.marginTop = '30px';
        } else {
          showToast('לא נמצאו מגרשים פנויים', 'info');
        }
      }
    };
    
    await apiService.searchMultipleSlots(credentials.tennisCenter, date, slots, onPartialResult);
  } catch (error) {
    console.error('Error fetching courts:', error);
    document.getElementById('loading-message').style.display = 'none';
    showToast('שגיאה בטעינת המגרשים', 'error');
  }
}

/**
 * Render courts results (supports partial/streaming updates)
 */
function renderCourtsResults(slots, results, date) {
  const courtsList = document.getElementById('courts-list');
  courtsList.innerHTML = '';
  
  slots.forEach((slot) => {
    // Use formatDate to match the key format used in searchMultipleSlots
    const formattedDate = formatDate(slot.date);
    const key = `${formattedDate}_${slot.time}`;
    const result = results.get(key);
    
    // If no result yet, show loading state
    if (!result) {
      const timeSlot = document.createElement('div');
      timeSlot.className = 'time-slot loading';
      timeSlot.innerHTML = `
        <div class="time-slot-header">
          <div class="time-label">${slot.time}</div>
        </div>
        <div class="status-badge loading">בודק...</div>
      `;
      courtsList.appendChild(timeSlot);
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
 * Parse date from URL parameter
 * Accepts formats: YYYY-MM-DD, DD/MM/YYYY
 */
function parseDateFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const dateParam = urlParams.get('date');
  
  if (!dateParam) {
    return null;
  }
  
  let date;
  
  // Try parsing YYYY-MM-DD format (ISO)
  if (dateParam.match(/^\d{4}-\d{2}-\d{2}$/)) {
    date = new Date(dateParam);
  }
  // Try parsing DD/MM/YYYY format
  else if (dateParam.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [day, month, year] = dateParam.split('/');
    date = new Date(year, month - 1, day);
  }
  else {
    console.error('Invalid date format in URL. Use YYYY-MM-DD or DD/MM/YYYY');
    return null;
  }
  
  // Validate date is valid
  if (isNaN(date.getTime())) {
    console.error('Invalid date in URL');
    return null;
  }
  
  // Validate date is in the future (or today)
  const today = getToday();
  if (date < today) {
    console.error('Date in URL is in the past');
    return null;
  }
  
  // Validate date is within 14 days
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 14);
  if (date > maxDate) {
    console.error('Date in URL is too far in the future (max 14 days)');
    return null;
  }
  
  return date;
}

/**
 * Initialize app
 */
function init() {
  // Check if already logged in
  const storedCredentials = localStorage.getItem('credentials');
  const urlDate = parseDateFromURL();
  
  if (storedCredentials && authService.loadFromStorage()) {
    credentials = JSON.parse(storedCredentials);
    updateTennisCenterDisplay(credentials.tennisCenter);
    
    // If date is provided in URL, go directly to courts screen
    if (urlDate) {
      showCourts(urlDate);
    } else {
      showDateSelection();
    }
  } else if (urlDate) {
    // If date is provided but not logged in, show toast
    showToast('יש להתחבר תחילה', 'error');
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
