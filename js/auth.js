// Authentication & Session Management for WatchDog PWA
import { store } from "./store.js";

const SESSION_STORAGE_KEY = "watchdog_active_session_v1";
const ADMIN_DEFAULT_CREDENTIALS = {
  username: "admin",
  password: "admin123",
  pin: "1234",
  name: "Operations Dispatcher",
  role: "ADMIN"
};

class AuthManager {
  constructor() {
    this.currentSession = this.loadSession();
    this.listeners = [];
  }

  loadSession() {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Session parse error:", e);
    }
    return null;
  }

  saveSession(sessionData, persist = true) {
    this.currentSession = sessionData;
    try {
      if (persist) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
      } else {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
      }
    } catch (e) {
      console.warn("Session save warning:", e);
    }
    this.notify();
  }

  clearSession() {
    this.currentSession = null;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {}
    this.notify();
  }

  onAuthStateChanged(callback) {
    this.listeners.push(callback);
    callback(this.currentSession);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify() {
    this.listeners.forEach(cb => cb(this.currentSession));
  }

  getCurrentUser() {
    return this.currentSession;
  }

  isLoggedIn() {
    return !!this.currentSession;
  }

  isAdmin() {
    return this.currentSession?.role === "ADMIN";
  }

  isRider() {
    return this.currentSession?.role === "RIDER";
  }

  // Admin Login
  loginAdmin(usernameOrPin, password) {
    const cleanUser = (usernameOrPin || "").trim().toLowerCase();
    const cleanPass = (password || "").trim();

    if (
      (cleanUser === "admin" && cleanPass === "admin123") ||
      (cleanUser === "admin@watchdog.com" && cleanPass === "admin123") ||
      (cleanUser === "1234" && !cleanPass) ||
      (cleanPass === "admin123")
    ) {
      const session = {
        role: "ADMIN",
        userId: "admin_master",
        name: "WatchDog Dispatcher",
        email: "dispatch@watchdog.com",
        loggedInAt: new Date().toISOString()
      };
      this.saveSession(session, true);
      return { success: true, session };
    }

    return { 
      success: false, 
      message: "Invalid admin credentials. Use ID: 'admin' and Password: 'admin123'" 
    };
  }

  // Rider Login
  loginRider(riderIdOrPhone, password) {
    if (!riderIdOrPhone || !password) {
      return { success: false, message: "Please enter your Rider ID and password." };
    }

    const rider = store.getRiderByCredentials(riderIdOrPhone, password);
    if (!rider) {
      return { 
        success: false, 
        message: "Invalid Rider ID or Password. Check your credentials or contact dispatch." 
      };
    }

    const session = {
      role: "RIDER",
      userId: rider.id,
      riderId: rider.riderId,
      name: rider.name,
      phone: rider.phone,
      vehicle: rider.vehicle,
      hub: rider.hub,
      loggedInAt: new Date().toISOString()
    };

    this.saveSession(session, true);
    return { success: true, rider, session };
  }

  logout() {
    this.clearSession();
  }
}

export const auth = new AuthManager();
