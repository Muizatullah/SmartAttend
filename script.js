/* ============================================================
   SmartAttend — script.js
   Shared utilities: Auth, Location, QR Generate, QR Scan,
   Route Guard, Toast Notifications
   ============================================================ */

/* ──────────────────────────────────────────────
   1. TOAST NOTIFICATIONS
   ────────────────────────────────────────────── */
function showToast(message, type = 'success', duration = 3500) {
  // Remove existing toasts
  document.querySelectorAll('.sa-toast').forEach(t => t.remove());

  const colors = {
    success: { bg: '#dcfce7', border: '#1B7A43', color: '#0f5c2e', icon: '✅' },
    error:   { bg: '#fee2e2', border: '#e53e3e', color: '#c53030', icon: '❌' },
    warning: { bg: '#fffbeb', border: '#f59e0b', color: '#b45309', icon: '⚠️' },
    info:    { bg: '#eff6ff', border: '#3b82f6', color: '#1d4ed8', icon: 'ℹ️'  },
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.className = 'sa-toast';
  toast.innerHTML = `<span>${c.icon}</span><span>${message}</span>`;
  toast.style.cssText = `
    position: fixed; bottom: 28px; right: 28px; z-index: 9999;
    display: flex; align-items: center; gap: 10px;
    background: ${c.bg}; color: ${c.color};
    border: 1.5px solid ${c.border}; border-radius: 12px;
    padding: 14px 20px; font-family: 'DM Sans', sans-serif;
    font-size: .92rem; font-weight: 600;
    box-shadow: 0 8px 28px rgba(0,0,0,0.12);
    animation: toastIn .35s ease both;
    max-width: 340px;
  `;

  // Inject keyframe once
  if (!document.getElementById('sa-toast-style')) {
    const style = document.createElement('style');
    style.id = 'sa-toast-style';
    style.textContent = `
      @keyframes toastIn  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
      @keyframes toastOut { from { opacity:1; transform:translateY(0);     } to { opacity:0; transform:translateY(16px); } }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut .35s ease both';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}


/* ──────────────────────────────────────────────
   2. AUTH — localStorage-based session
   ────────────────────────────────────────────── */
const Auth = {
  KEY: 'smartattend_user',

  /**
   * Save user to localStorage after login/register
   * @param {{ name, email, role, matric?, department? }} user
   */
  login(user) {
    localStorage.setItem(this.KEY, JSON.stringify(user));
  },

  /** Remove session */
  logout() {
    localStorage.removeItem(this.KEY);
    window.location.href = 'login.html';
  },

  /** Get logged-in user object or null */
  getUser() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY));
    } catch {
      return null;
    }
  },

  /** Returns true if a user is logged in */
  isLoggedIn() {
    return !!this.getUser();
  },

  /** Returns 'student' | 'lecturer' | null */
  getRole() {
    const u = this.getUser();
    return u ? u.role : null;
  },
};


/* ──────────────────────────────────────────────
   3. ROUTE GUARD
   Call at top of each dashboard page to protect it.
   Pass expected role: 'student' | 'lecturer' | null (any)
   ────────────────────────────────────────────── */
function guardRoute(expectedRole = null) {
  if (!Auth.isLoggedIn()) {
    showToast('Please log in to continue.', 'warning');
    setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    return false;
  }
  if (expectedRole && Auth.getRole() !== expectedRole) {
    showToast('Access denied. Wrong role.', 'error');
    const redirect = Auth.getRole() === 'student'
      ? 'student-dashboard.html'
      : 'lecturer-dashboard.html';
    setTimeout(() => { window.location.href = redirect; }, 1200);
    return false;
  }
  return true;
}


/* ──────────────────────────────────────────────
   4. POPULATE DASHBOARD WITH USER DATA
   Call after guardRoute() on dashboard pages
   ────────────────────────────────────────────── */
function populateDashboard() {
  const user = Auth.getUser();
  if (!user) return;

  // Sidebar name
  const nameEl = document.getElementById('sidebarName');
  if (nameEl) nameEl.textContent = user.name || 'User';

  // Avatar initials
  const avatarEl = document.getElementById('sidebarAvatar');
  if (avatarEl) {
    const initials = (user.name || 'U')
      .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    avatarEl.textContent = initials;
  }

  // Page greeting
  const subtitleEl = document.getElementById('pageSubtitle');
  if (subtitleEl) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    subtitleEl.textContent = `${greeting}, ${user.name?.split(' ')[0] || 'there'}! Here's your summary.`;
  }

  // Profile page fields (if present)
  const fields = {
    'profileName':   user.name,
    'profileEmail':  user.email,
    'profileMatric': user.matric || '—',
    'profileDept':   user.department || '—',
    'profilePhone':  user.phone || '—',
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val) el.textContent = val;
  });
}


/* ──────────────────────────────────────────────
   5. LOCATION VERIFICATION
   ────────────────────────────────────────────── */
const Location = {
  /**
   * Get current GPS coordinates
   * Returns Promise<{ lat, lng }>
   */
  getCurrent() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported by this browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => {
          const msgs = {
            1: 'Location access denied. Please enable location permission.',
            2: 'Location unavailable. Try again.',
            3: 'Location request timed out.',
          };
          reject(new Error(msgs[err.code] || 'Unknown location error.'));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  },

  /**
   * Calculate distance in metres between two coordinates (Haversine)
   */
  distanceMetres(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  /**
   * Verify student is within allowedRadius metres of classroomLat/Lng
   * Returns Promise<{ verified: bool, distance: number, message: string }>
   *
   * Usage:
   *   Location.verify(classLat, classLng, 100).then(result => { ... })
   */
  async verify(classroomLat, classroomLng, allowedRadius = 100) {
    try {
      const { lat, lng } = await this.getCurrent();
      const distance = Math.round(this.distanceMetres(lat, lng, classroomLat, classroomLng));

      if (distance <= allowedRadius) {
        return {
          verified: true,
          distance,
          message: `✅ Location verified! You are ${distance}m from the classroom.`,
        };
      } else {
        return {
          verified: false,
          distance,
          message: `❌ Too far! You are ${distance}m away. Must be within ${allowedRadius}m.`,
        };
      }
    } catch (err) {
      return { verified: false, distance: null, message: err.message };
    }
  },

  /**
   * Quick helper — verify and show a toast with the result
   * Returns Promise<bool>
   */
  async verifyAndToast(classroomLat, classroomLng, allowedRadius = 100) {
    showToast('Checking your location...', 'info', 2000);
    const result = await this.verify(classroomLat, classroomLng, allowedRadius);
    showToast(result.message, result.verified ? 'success' : 'error');
    return result.verified;
  },
};


/* ──────────────────────────────────────────────
   6. QR CODE GENERATOR
   Uses the qrcode.js CDN library.
   Inject the script tag automatically if not present.
   ────────────────────────────────────────────── */
const QRGenerator = {
  /**
   * Load qrcode library from CDN (injects script once)
   */
  loadLib() {
    return new Promise((resolve, reject) => {
      if (window.QRCode) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.onload  = resolve;
      script.onerror = () => reject(new Error('Failed to load QR library.'));
      document.head.appendChild(script);
    });
  },

  /**
   * Render a QR code into a container element
   * @param {string|HTMLElement} container  — CSS selector or DOM element
   * @param {string}             text       — data to encode
   * @param {number}             size       — width/height in px (default 200)
   *
   * Usage:
   *   await QRGenerator.render('#qr-box', 'CSC301|2025-05-09|08:00|LTHallA', 200)
   */
  async render(container, text, size = 200) {
    await this.loadLib();
    const el = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    if (!el) throw new Error('QR container not found.');
    el.innerHTML = ''; // clear previous
    new window.QRCode(el, {
      text,
      width:  size,
      height: size,
      colorDark:  '#0f5c2e',
      colorLight: '#f0faf5',
      correctLevel: window.QRCode.CorrectLevel.H,
    });
  },

  /**
   * Build the QR data string for a session
   * @param {{ course, type, venue, date, time, lecturerId, lat, lng }} session
   */
  buildSessionData(session) {
    return [
      'SMARTATTEND',
      session.course,
      session.type,
      session.venue,
      session.date  || new Date().toLocaleDateString('en-GB'),
      session.time  || new Date().toLocaleTimeString(),
      session.lecturerId || 'LEC001',
      session.lat   || '0',
      session.lng   || '0',
    ].join('|');
  },

  /**
   * Parse scanned QR data string back into an object
   * Returns null if not a valid SmartAttend QR
   */
  parseSessionData(raw) {
    const parts = raw.split('|');
    if (parts[0] !== 'SMARTATTEND' || parts.length < 7) return null;
    return {
      course:     parts[1],
      type:       parts[2],
      venue:      parts[3],
      date:       parts[4],
      time:       parts[5],
      lecturerId: parts[6],
      lat:        parseFloat(parts[7]) || 0,
      lng:        parseFloat(parts[8]) || 0,
    };
  },
};


/* ──────────────────────────────────────────────
   7. QR SCANNER (Camera-based)
   Uses html5-qrcode library from CDN.
   ────────────────────────────────────────────── */
const QRScanner = {
  instance: null,

  /**
   * Load html5-qrcode library
   */
  loadLib() {
    return new Promise((resolve, reject) => {
      if (window.Html5Qrcode) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      script.onload  = resolve;
      script.onerror = () => reject(new Error('Failed to load QR scanner library.'));
      document.head.appendChild(script);
    });
  },

  /**
   * Start scanning in a container element
   * @param {string}   containerId  — id of the div to render scanner into
   * @param {Function} onSuccess    — callback(decodedText, sessionData)
   * @param {Function} onError      — callback(errorMessage)  [optional]
   *
   * Usage:
   *   QRScanner.start('scanner-box', (text, session) => {
   *     console.log('Scanned course:', session.course);
   *   });
   */
  async start(containerId, onSuccess, onError) {
    await this.loadLib();
    this.stop(); // stop any existing scanner

    this.instance = new window.Html5Qrcode(containerId);

    const config = {
      fps: 10,
      qrbox: { width: 220, height: 220 },
      aspectRatio: 1.0,
    };

    try {
      await this.instance.start(
        { facingMode: 'environment' }, // rear camera
        config,
        (decodedText) => {
          const session = QRGenerator.parseSessionData(decodedText);
          if (session) {
            this.stop();
            onSuccess(decodedText, session);
          } else {
            showToast('Invalid QR code. Not a SmartAttend code.', 'error');
          }
        },
        (errorMsg) => {
          // Scan frame errors — mostly ignorable
          if (onError) onError(errorMsg);
        }
      );
      showToast('Camera started. Point at the QR code.', 'info');
    } catch (err) {
      showToast('Camera access denied or unavailable.', 'error');
      console.error('QRScanner.start error:', err);
    }
  },

  /** Stop the active scanner */
  async stop() {
    if (this.instance) {
      try { await this.instance.stop(); } catch (_) {}
      this.instance = null;
    }
  },
};


/* ──────────────────────────────────────────────
   8. ATTENDANCE RECORDER
   Saves / reads attendance from localStorage
   (Replace with API calls for a real backend)
   ────────────────────────────────────────────── */
const Attendance = {
  KEY: 'smartattend_records',

  /** Get all records */
  getAll() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
    catch { return []; }
  },

  /** Save a new attendance record */
  save(record) {
    const records = this.getAll();
    records.unshift({
      id:        Date.now(),
      studentId: record.studentId || Auth.getUser()?.email || 'unknown',
      name:      record.name      || Auth.getUser()?.name  || 'Unknown',
      matric:    record.matric    || Auth.getUser()?.matric || '—',
      course:    record.course,
      type:      record.type,
      venue:     record.venue,
      date:      record.date      || new Date().toLocaleDateString('en-GB'),
      time:      new Date().toLocaleTimeString(),
      status:    record.status    || 'present',
      lat:       record.lat       || null,
      lng:       record.lng       || null,
    });
    localStorage.setItem(this.KEY, JSON.stringify(records));
    return records[0];
  },

  /** Get records for current student */
  getForStudent() {
    const user = Auth.getUser();
    if (!user) return [];
    return this.getAll().filter(r => r.studentId === user.email);
  },

  /** Get records for a specific course */
  getForCourse(course) {
    return this.getAll().filter(r => r.course === course);
  },

  /** Calculate attendance percentage for current student in a course */
  getPercentage(course) {
    const records = this.getForStudent().filter(r => r.course === course);
    if (!records.length) return 0;
    const present = records.filter(r => r.status === 'present' || r.status === 'late').length;
    return Math.round((present / records.length) * 100);
  },
};


/* ──────────────────────────────────────────────
   9. FULL ATTENDANCE FLOW (Student)
   One call does: scan → verify location → record
   ────────────────────────────────────────────── */

/**
 * markAttendance(containerId)
 *
 * 1. Opens camera in `containerId` div
 * 2. Scans lecturer's QR code
 * 3. Verifies student GPS vs classroom coords
 * 4. Records attendance
 * 5. Shows toast result
 *
 * @param {string} containerId — id of the scanner div
 * @param {Function} onDone    — callback({ success, record })
 */
async function markAttendance(containerId, onDone) {
  if (!guardRoute('student')) return;

  showToast('Starting camera...', 'info', 2000);

  await QRScanner.start(
    containerId,
    async (rawText, session) => {
      showToast('QR code detected! Verifying location...', 'info', 2500);

      // Verify location
      const locResult = await Location.verify(session.lat, session.lng, 150);

      if (!locResult.verified) {
        showToast(locResult.message, 'error', 5000);
        if (onDone) onDone({ success: false, reason: 'location' });
        return;
      }

      // Record attendance
      const record = Attendance.save({
        course: session.course,
        type:   session.type,
        venue:  session.venue,
        date:   session.date,
        status: 'present',
        lat:    locResult.lat,
        lng:    locResult.lng,
      });

      showToast(`✅ Attendance marked for ${session.course}!`, 'success', 4000);
      if (onDone) onDone({ success: true, record });
    },
    null
  );
}


/* ──────────────────────────────────────────────
   10. SESSION MANAGER (Lecturer)
   Manages active session state
   ────────────────────────────────────────────── */
const Session = {
  KEY: 'smartattend_session',

  /** Start a new session and store it */
  start(course, type, venue, lat, lng, expiryMinutes = 10) {
    const session = {
      course, type, venue, lat, lng,
      startedAt: Date.now(),
      expiresAt: Date.now() + expiryMinutes * 60000,
      lecturerId: Auth.getUser()?.email || 'unknown',
    };
    localStorage.setItem(this.KEY, JSON.stringify(session));
    return session;
  },

  /** Get active session (null if none or expired) */
  getActive() {
    try {
      const s = JSON.parse(localStorage.getItem(this.KEY));
      if (!s) return null;
      if (Date.now() > s.expiresAt) { this.end(); return null; }
      return s;
    } catch { return null; }
  },

  /** End / clear the active session */
  end() {
    localStorage.removeItem(this.KEY);
  },

  /** Returns true if a session is currently active */
  isActive() {
    return !!this.getActive();
  },

  /** Remaining time in seconds */
  remainingSeconds() {
    const s = this.getActive();
    if (!s) return 0;
    return Math.max(0, Math.round((s.expiresAt - Date.now()) / 1000));
  },
};


/* ──────────────────────────────────────────────
   11. UTILITY HELPERS
   ────────────────────────────────────────────── */

/** Format seconds → MM:SS */
function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Get initials from full name */
function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/** Capitalise first letter */
function capitalise(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Format a JS Date → "09 May 2025" */
function formatDate(date = new Date()) {
  return date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

/** Debounce — useful for search inputs */
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}


/* ──────────────────────────────────────────────
   12. AUTO-INIT ON PAGE LOAD
   ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Update topbar date if present
  const dateEl = document.getElementById('topbarDate');
  if (dateEl) dateEl.textContent = formatDate();

  // Populate dashboard if user data exists
  if (Auth.isLoggedIn()) populateDashboard();
});


/* ──────────────────────────────────────────────
   EXPORTS (for use as ES module if needed)
   Remove if using as plain <script> tag
   ────────────────────────────────────────────── */
// export { Auth, Location, QRGenerator, QRScanner, Attendance, Session,
//          showToast, guardRoute, populateDashboard, markAttendance,
//          formatTime, getInitials, capitalise, formatDate, debounce };
