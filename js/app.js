// Main Application Controller & PWA Lifecycle for WatchDog
import { store } from "./store.js";
import { auth } from "./auth.js";
import { isFirestoreAvailable } from "./firebase-config.js";
import { RiderPortal } from "./rider-portal.js";
import { AdminPortal } from "./admin-portal.js";

let deferredPrompt = null;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initPwaServiceWorker();
  initPwaInstallPrompt();
  initToastListener();
  initModalCloseListeners();
  initAuthEventListeners();
  initNetworkStatusListener();

  // Initialize Sub-Portals
  RiderPortal.init();
  AdminPortal.init();

  // Subscribe to auth state changes to route properly
  auth.onAuthStateChanged((session) => {
    updateHeaderUserStatus(session);
    routeToActivePortal(session);
  });

  // Real-time store updates re-render active views
  store.subscribeRiders(() => {
    const session = auth.getCurrentUser();
    if (session) routeToActivePortal(session);
  });

  store.subscribeShifts(() => {
    const session = auth.getCurrentUser();
    if (session) routeToActivePortal(session);
  });
});

// ==========================================
// VIEW ROUTER & NAVIGATION
// ==========================================
function routeToActivePortal(session) {
  const portalContent = document.getElementById("portal-content");
  const authContainer = document.getElementById("auth-container");
  const roleSwitcher = document.getElementById("role-switcher-container");

  if (!portalContent || !authContainer) return;

  if (!session) {
    // Show Authentication / Role Picker
    portalContent.style.display = "none";
    authContainer.style.display = "block";
    if (roleSwitcher) roleSwitcher.style.display = "none";
    renderLoginView();
  } else {
    portalContent.style.display = "block";
    authContainer.style.display = "none";
    if (roleSwitcher) roleSwitcher.style.display = "flex";

    // Update active pill button
    document.querySelectorAll(".role-pill-btn").forEach(btn => {
      if (btn.getAttribute("data-role") === session.role) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    if (session.role === "RIDER") {
      RiderPortal.render(portalContent);
    } else if (session.role === "ADMIN") {
      AdminPortal.render(portalContent);
    }
  }
}

// ==========================================
// AUTHENTICATION & LOGIN SCREENS
// ==========================================
function renderLoginView() {
  const authContainer = document.getElementById("auth-container");
  if (!authContainer) return;

  const urlParams = new URLSearchParams(window.location.search);
  const defaultTab = urlParams.get("role") === "admin" ? "admin" : "rider";

  authContainer.innerHTML = `
    <div style="max-width: 460px; margin: 30px auto; padding: 0 12px;">
      <!-- Welcome Hero -->
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="./assets/logo.svg" alt="WatchDog Logo" style="width: 72px; height: 72px; margin-bottom: 12px; filter: drop-shadow(0 4px 10px rgba(107, 23, 36, 0.3));">
        <h2 style="font-size: 24px; font-weight: 800; color: var(--burgundy-900);">WatchDog Dispatch</h2>
        <p style="font-size: 13.5px; color: var(--text-secondary); margin-top: 4px;">
          Rider Fleet Management & Real-time Shift Reconciliation
        </p>
      </div>

      <!-- Auth Card -->
      <div class="card" style="border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); padding: 24px;">
        <!-- Login Role Tabs -->
        <div style="display: flex; background: var(--burgundy-50); padding: 4px; border-radius: var(--radius-full); margin-bottom: 22px; border: 1px solid var(--burgundy-100);">
          <button id="tab-login-rider" class="btn btn-sm ${defaultTab === 'rider' ? 'btn-primary' : 'btn-ghost'}" style="flex: 1; border-radius: var(--radius-full);">
            🛵 Rider Login
          </button>
          <button id="tab-login-admin" class="btn btn-sm ${defaultTab === 'admin' ? 'btn-primary' : 'btn-ghost'}" style="flex: 1; border-radius: var(--radius-full);">
            🛡️ Admin / Dispatch
          </button>
        </div>

        <!-- RIDER LOGIN FORM -->
        <form id="form-rider-login" style="display: ${defaultTab === 'rider' ? 'block' : 'none'};">
          <div class="form-group">
            <label class="form-label">Rider ID or Phone Number <span class="required">*</span></label>
            <input type="text" id="login-rider-id" class="form-input" placeholder="e.g. RD-001" value="RD-001" required>
            <div class="form-hint">Enter your designated Rider ID or registered phone number.</div>
          </div>

          <div class="form-group">
            <label class="form-label">Password / Access PIN <span class="required">*</span></label>
            <input type="password" id="login-rider-password" class="form-input" placeholder="••••••••" value="rider123" required>
          </div>

          <button type="submit" class="btn btn-primary btn-block btn-lg" style="margin-top: 20px;">
            🚀 Open Rider Shift Portal
          </button>

          <!-- Quick Test Demo Logins -->
          <div style="margin-top: 20px; padding-top: 14px; border-top: 1px dashed var(--border-light); font-size: 12px; color: var(--text-secondary);">
            <strong>Quick Demo Accounts:</strong>
            <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary btn-sm demo-rider-btn" data-id="RD-001" data-pass="rider123">RD-001 (Kofi)</button>
              <button type="button" class="btn btn-secondary btn-sm demo-rider-btn" data-id="RD-002" data-pass="rider123">RD-002 (Ama)</button>
              <button type="button" class="btn btn-secondary btn-sm demo-rider-btn" data-id="RD-003" data-pass="rider123">RD-003 (Ibrahim)</button>
            </div>
          </div>
        </form>

        <!-- ADMIN LOGIN FORM -->
        <form id="form-admin-login" style="display: ${defaultTab === 'admin' ? 'block' : 'none'};">
          <div class="form-group">
            <label class="form-label">Admin Username or Email <span class="required">*</span></label>
            <input type="text" id="login-admin-user" class="form-input" placeholder="admin" value="admin" required>
          </div>

          <div class="form-group">
            <label class="form-label">Admin Password <span class="required">*</span></label>
            <input type="password" id="login-admin-password" class="form-input" placeholder="••••••••" value="admin123" required>
            <div class="form-hint">Default Admin Password: <code>admin123</code></div>
          </div>

          <button type="submit" class="btn btn-primary btn-block btn-lg" style="margin-top: 20px;">
            🛡️ Open Dispatcher Dashboard
          </button>
        </form>
      </div>
    </div>
  `;

  // Bind Form Listeners
  const riderTabBtn = document.getElementById("tab-login-rider");
  const adminTabBtn = document.getElementById("tab-login-admin");
  const riderForm = document.getElementById("form-rider-login");
  const adminForm = document.getElementById("form-admin-login");

  if (riderTabBtn && adminTabBtn) {
    riderTabBtn.addEventListener("click", () => {
      riderTabBtn.className = "btn btn-sm btn-primary";
      adminTabBtn.className = "btn btn-sm btn-ghost";
      riderForm.style.display = "block";
      adminForm.style.display = "none";
    });

    adminTabBtn.addEventListener("click", () => {
      adminTabBtn.className = "btn btn-sm btn-primary";
      riderTabBtn.className = "btn btn-sm btn-ghost";
      adminForm.style.display = "block";
      riderForm.style.display = "none";
    });
  }

  // Demo Riders Quick Pick
  document.querySelectorAll(".demo-rider-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("login-rider-id").value = btn.getAttribute("data-id");
      document.getElementById("login-rider-password").value = btn.getAttribute("data-pass");
      riderForm.dispatchEvent(new Event("submit"));
    });
  });

  // Rider Submit
  riderForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const riderId = document.getElementById("login-rider-id").value;
    const password = document.getElementById("login-rider-password").value;

    const res = auth.loginRider(riderId, password);
    if (res.success) {
      window.dispatchEvent(new CustomEvent("watchdog-toast", {
        detail: { message: `Welcome, ${res.rider.name}!`, type: "success" }
      }));
    } else {
      alert(res.message);
    }
  });

  // Admin Submit
  adminForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const user = document.getElementById("login-admin-user").value;
    const password = document.getElementById("login-admin-password").value;

    const res = auth.loginAdmin(user, password);
    if (res.success) {
      window.dispatchEvent(new CustomEvent("watchdog-toast", {
        detail: { message: "Welcome, Dispatcher!", type: "success" }
      }));
    } else {
      alert(res.message);
    }
  });
}

// ==========================================
// HEADER USER BAR & LOGOUT
// ==========================================
function updateHeaderUserStatus(session) {
  const userChip = document.getElementById("header-user-chip");
  const userAvatar = document.getElementById("header-user-avatar");
  const userName = document.getElementById("header-user-name");

  if (!userChip || !userAvatar || !userName) return;

  if (session) {
    userChip.style.display = "flex";
    userAvatar.textContent = session.name ? session.name.charAt(0) : (session.role === "ADMIN" ? "A" : "R");
    userName.textContent = session.name || (session.role === "ADMIN" ? "Admin" : "Rider");
  } else {
    userChip.style.display = "none";
  }
}

function initAuthEventListeners() {
  // Logout Button
  const logoutBtn = document.getElementById("btn-header-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to log out?")) {
        auth.logout();
        window.dispatchEvent(new CustomEvent("watchdog-toast", {
          detail: { message: "Logged out successfully.", type: "info" }
        }));
      }
    });
  }

  // Switch Portal Buttons in Header
  document.querySelectorAll(".role-pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetRole = btn.getAttribute("data-role");
      const current = auth.getCurrentUser();
      if (!current) return;

      if (targetRole === "ADMIN") {
        auth.loginAdmin("admin", "admin123");
      } else if (targetRole === "RIDER") {
        // If switching from admin to rider, default to first rider
        const riders = store.getRiders();
        if (riders.length > 0) {
          auth.loginRider(riders[0].riderId, riders[0].password);
        }
      }
    });
  });
}

// ==========================================
// MODAL CLOSE HELPERS (ESC / Backdrop / X)
// ==========================================
function initModalCloseListeners() {
  document.querySelectorAll(".modal-close-trigger").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.closest(".modal-backdrop")?.classList.remove("active");
    });
  });

  document.querySelectorAll(".modal-backdrop").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("active");
      }
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-backdrop.active").forEach(m => m.classList.remove("active"));
    }
  });
}

// ==========================================
// TOAST NOTIFICATIONS SYSTEM
// ==========================================
function initToastListener() {
  const container = document.getElementById("toast-container");
  if (!container) return;

  window.addEventListener("watchdog-toast", (e) => {
    const { message, type } = e.detail || {};
    const toast = document.createElement("div");
    toast.className = `toast ${type === 'success' ? 'toast-success' : (type === 'error' ? 'toast-error' : '')}`;
    
    let icon = "🔔";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "⚠️";
    if (type === "info") icon = "ℹ️";

    toast.innerHTML = `<span>${icon}</span><span>${message || ''}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  });
}

// ==========================================
// PWA SERVICE WORKER & INSTALL PROMPT
// ==========================================
function initPwaServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js")
        .then((reg) => {
          console.log("🛡️ WatchDog Service Worker active:", reg.scope);
        })
        .catch((err) => {
          console.warn("Service worker note:", err);
        });
    });
  }
}

function initPwaInstallPrompt() {
  const banner = document.getElementById("pwa-install-banner");
  const installBtn = document.getElementById("btn-pwa-install");
  const dismissBtn = document.getElementById("btn-pwa-dismiss");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (banner) banner.style.display = "flex";
  });

  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (banner) banner.style.display = "none";
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install: ${outcome}`);
        deferredPrompt = null;
      }
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      if (banner) banner.style.display = "none";
    });
  }
}

// ==========================================
// NETWORK & FIREBASE LIVE STATUS
// ==========================================
function initNetworkStatusListener() {
  const statusContainer = document.querySelector(".status-ticker");
  if (!statusContainer) return;

  function updateStatus() {
    const isOnline = navigator.onLine;
    const dot = statusContainer.querySelector(".live-dot");
    const textContainer = statusContainer.querySelector("div span:last-child");

    if (!isOnline) {
      if (dot) {
        dot.style.backgroundColor = "#EF4444";
        dot.style.boxShadow = "0 0 8px #EF4444";
      }
      if (textContainer) {
        textContainer.innerHTML = `Mode: <strong style="color: #F87171;">Offline Resilient (Cached)</strong>`;
      }
    } else if (isFirestoreAvailable) {
      if (dot) {
        dot.style.backgroundColor = "#10B981";
        dot.style.boxShadow = "0 0 8px #10B981";
      }
      if (textContainer) {
        textContainer.innerHTML = `Live System: <strong style="color: #34D399;">Firebase Cloud Real-Time Active</strong>`;
      }
    } else {
      if (dot) {
        dot.style.backgroundColor = "#F59E0B";
        dot.style.boxShadow = "0 0 8px #F59E0B";
      }
      if (textContainer) {
        textContainer.innerHTML = `Mode: <strong style="color: #FBBF24;">Local Cache / Standalone Mode</strong>`;
      }
    }
  }

  window.addEventListener("online", () => {
    updateStatus();
    window.dispatchEvent(new CustomEvent("watchdog-toast", {
      detail: { message: "Internet connection restored. Live cloud sync enabled.", type: "success" }
    }));
  });

  window.addEventListener("offline", () => {
    updateStatus();
    window.dispatchEvent(new CustomEvent("watchdog-toast", {
      detail: { message: "Offline mode active. Shifts and data will save locally.", type: "info" }
    }));
  });

  updateStatus();
}

