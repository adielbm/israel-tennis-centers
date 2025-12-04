import { AuthService, APIService } from './api.js';
import { getToday, getNextDays, formatDateDisplay, generateTimeSlotsForDate, formatDate } from './utils.js';
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
  
  const email = document.getElementById('email').value;
  const userId = document.getElementById('user-id').value;
  const tennisCenter = document.getElementById('tennis-center').value;
  
  // Store credentials
  credentials = { email, userId, tennisCenter };
  localStorage.setItem('credentials', JSON.stringify(credentials));
  
  // Update tennis center city display
  updateTennisCenterDisplay(tennisCenter);
  
  showToast('Logging in...', 'info');
  
  try {
    await authService.login(email, userId);
    showToast('Login successful!', 'success');
    showDateSelection();
  } catch (error) {
    console.error('Login failed:', error);
    showToast(`Login failed: ${error.message}`, 'error');
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
  const dates = getNextDays(today, 14);
  
  dates.forEach((date, index) => {
    const isToday = index === 0;
    const isTomorrow = index === 1;
    
    let label = formatDateDisplay(date);
    if (isToday) label = `Today - ${label}`;
    else if (isTomorrow) label = `Tomorrow - ${label}`;
    
    const dateItem = document.createElement('div');
    dateItem.className = 'date-item';
    dateItem.innerHTML = `
      <div class="date-label">${label}</div>
    `;
    dateItem.addEventListener('click', () => showCourts(date));
    dateList.appendChild(dateItem);
  });
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
          <h3>No time slots available</h3>
          <p>Please try a different date.</p>
        </div>
      `;
      return;
    }
    
    // Search for court availability for all slots
    showToast(`Checking ${slots.length} time slots...`, 'info');
    console.log('Searching for courts with:', { tennisCenter: credentials.tennisCenter, date, slotsCount: slots.length });
    const results = await apiService.searchMultipleSlots(credentials.tennisCenter, date, slots);
    
    console.log('Search completed. Results:', results);
    
    document.getElementById('loading-message').style.display = 'none';
    
    // Render results
    renderCourtsResults(slots, results, date);
    
    const availableCount = Array.from(results.values()).filter(r => r.status === 'available').length;
    if (availableCount > 0) {
      showToast(`Found ${availableCount} available time slot${availableCount > 1 ? 's' : ''}`, 'success');
    } else {
      showToast('No available slots found', 'info');
    }
  } catch (error) {
    console.error('Error fetching courts:', error);
    document.getElementById('loading-message').style.display = 'none';
    showToast('Error loading courts', 'error');
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
      : 'אין מגרשים פנויים';
    
    const courtTags = isAvailable 
      ? result.courts.map(num => `<span class="court-tag">${num}</span>`).join('')
      : '';
    
    timeSlot.innerHTML = `
      <div class="time-slot-header">
        <div class="time-label">${slot.time}</div>
        <span class="status-badge ${isAvailable ? 'available' : 'unavailable'}">
          ${isAvailable ? 'פנוי' : 'לא פנוי'}
        </span>
      </div>
      <div class="courts-info">${courtsInfo}</div>
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
  showToast('Logged out successfully', 'success');
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
  const center = TENNIS_CENTERS.find(c => c.id === tennisCenterId);
  const displayElement = document.getElementById('tennis-center-city');
  if (center && displayElement) {
    displayElement.textContent = `${center.name}`;
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
}

// Start the app
init();
