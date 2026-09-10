// Admin Portal Logic - Rider CRUD, Live Shifts Feed, Timestamps, EOD Reconciliation & Reports
import { store } from "./store.js";
import { auth } from "./auth.js";

let activeTab = "roster"; // "roster", "riders", "reports"
let searchQuery = "";
let selectedDateFilter = "";
let selectedRiderFilter = "ALL";
let editingRiderId = null;
let deletingRiderId = null;
let liveRosterInterval = null;

export const AdminPortal = {
  init() {
    this.bindGlobalModals();
    this.startLiveDurationTicker();
  },

  render(container) {
    const session = auth.getCurrentUser();
    if (!session || session.role !== "ADMIN") {
      container.innerHTML = `<div class="empty-state"><h3>Please log in as an administrator</h3></div>`;
      return;
    }

    const riders = store.getRiders();
    const shifts = store.getShifts();
    const todayIso = new Date().toISOString().split("T")[0];

    // Compute Today's KPIs
    const todayShifts = shifts.filter(s => s.date === todayIso || s.startTimestamp?.startsWith(todayIso));
    const activeRidersCount = riders.filter(r => r.currentStatus === "ON_DUTY").length;
    const completedShiftsToday = todayShifts.filter(s => s.status === "COMPLETED");
    
    const totalCodToday = completedShiftsToday.reduce((sum, s) => sum + (parseFloat(s.codAmount) || 0), 0);
    const totalSuccessfulDeliveriesToday = completedShiftsToday.reduce((sum, s) => sum + (parseInt(s.successfulDeliveries) || 0), 0);
    const totalAssignedDeliveriesToday = completedShiftsToday.reduce((sum, s) => sum + (parseInt(s.assignedDeliveries) || 0), 0);
    const totalPickupsToday = completedShiftsToday.reduce((sum, s) => sum + (parseInt(s.pickupOrders) || 0), 0);

    let tabContentHtml = "";
    if (activeTab === "roster") {
      tabContentHtml = this.renderRosterTab(riders, todayShifts);
    } else if (activeTab === "riders") {
      tabContentHtml = this.renderRidersCrudTab(riders);
    } else if (activeTab === "reports") {
      tabContentHtml = this.renderReportsTab(shifts, riders);
    }

    container.innerHTML = `
      <div class="admin-view-container">
        <!-- KPI Metrics Grid -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-icon-green">
              <span>🟢</span>
            </div>
            <div class="kpi-content">
              <div class="kpi-label">Riders On Duty</div>
              <div class="kpi-value">${activeRidersCount} <span style="font-size: 14px; font-weight: 600; color: var(--text-muted);">/ ${riders.length}</span></div>
              <div class="kpi-sub">${activeRidersCount > 0 ? "Live active shifts right now" : "No active shifts"}</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-icon-burgundy">
              <span>💰</span>
            </div>
            <div class="kpi-content">
              <div class="kpi-label">Total COD In Care Today</div>
              <div class="kpi-value">GH₵ ${totalCodToday.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div class="kpi-sub">Across ${completedShiftsToday.length} closed shifts</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-icon-amber">
              <span>📦</span>
            </div>
            <div class="kpi-content">
              <div class="kpi-label">Deliveries Completed</div>
              <div class="kpi-value">${totalSuccessfulDeliveriesToday} <span style="font-size: 14px; font-weight: 600; color: var(--text-muted);">/ ${totalAssignedDeliveriesToday}</span></div>
              <div class="kpi-sub">${totalAssignedDeliveriesToday > 0 ? Math.round((totalSuccessfulDeliveriesToday / totalAssignedDeliveriesToday) * 100) + "% success rate" : "No deliveries yet"}</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-icon-blue">
              <span>🔄</span>
            </div>
            <div class="kpi-content">
              <div class="kpi-label">Pickup Orders</div>
              <div class="kpi-value">${totalPickupsToday}</div>
              <div class="kpi-sub">Merchant & return pickups</div>
            </div>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="card" style="padding-bottom: 0;">
          <div class="admin-tabs">
            <button class="admin-tab-btn ${activeTab === 'roster' ? 'active' : ''}" data-tab="roster">
              📡 Live Shift Feed & Timestamps
              <span class="count-badge">${activeRidersCount} Active</span>
            </button>
            <button class="admin-tab-btn ${activeTab === 'riders' ? 'active' : ''}" data-tab="riders">
              👥 Rider Accounts (${riders.length})
            </button>
            <button class="admin-tab-btn ${activeTab === 'reports' ? 'active' : ''}" data-tab="reports">
              📑 End-of-Day Shift Reports (${shifts.length})
            </button>
          </div>
        </div>

        <!-- Tab Body -->
        <div id="admin-tab-container">
          ${tabContentHtml}
        </div>
      </div>
    `;

    this.attachEventListeners(container);
  },

  // ==========================================
  // TAB 1: LIVE ROSTER & TIMESTAMPS FEED
  // ==========================================
  renderRosterTab(riders, todayShifts) {
    let rosterRows = "";

    riders.forEach(rider => {
      const activeShift = store.getActiveShiftForRider(rider.riderId);
      const todayClosedShift = todayShifts.find(s => (s.riderId === rider.riderId || s.riderDocId === rider.id) && s.status === "COMPLETED");

      let statusBadge = `<span class="badge badge-neutral">Offline</span>`;
      let timeDetails = `<span style="color: var(--text-muted); font-size: 12px;">Not started today</span>`;
      let shiftDurationHtml = `-`;

      if (activeShift) {
        const startTime = new Date(activeShift.startTimestamp);
        const timeFormatted = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        statusBadge = `<span class="badge badge-success pulse-badge"><span class="live-dot"></span> On Duty</span>`;
        timeDetails = `
          <div>
            <strong style="color: var(--burgundy-900);">🕒 Started: ${timeFormatted}</strong>
            <div style="font-size: 11px; color: var(--text-muted);">${formatTimeAgo(startTime)}</div>
          </div>
        `;
        shiftDurationHtml = `<span class="live-ticker-badge" data-start="${activeShift.startTimestamp}">Calculating...</span>`;
      } else if (todayClosedShift) {
        const startTime = new Date(todayClosedShift.startTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(todayClosedShift.endTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        statusBadge = `<span class="badge badge-burgundy">🏁 Shift Closed</span>`;
        timeDetails = `
          <div>
            <div>${startTime} → <strong>${endTime}</strong></div>
            <div style="font-size: 11px; color: #065F46; font-weight: 700;">COD: GH₵ ${Number(todayClosedShift.codAmount || 0).toFixed(2)} | Del: ${todayClosedShift.successfulDeliveries}/${todayClosedShift.assignedDeliveries}</div>
          </div>
        `;
        shiftDurationHtml = `${Math.floor(todayClosedShift.durationMinutes / 60)}h ${todayClosedShift.durationMinutes % 60}m`;
      }

      rosterRows += `
        <tr>
          <td>
            <div class="rider-cell">
              <div class="rider-avatar-sm">${rider.name.charAt(0)}</div>
              <div>
                <div class="rider-name-cell">${escapeHtml(rider.name)}</div>
                <div class="rider-id-sub">${escapeHtml(rider.riderId)} • ${escapeHtml(rider.phone)}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(rider.hub)}</td>
          <td>${statusBadge}</td>
          <td>${timeDetails}</td>
          <td><strong>${shiftDurationHtml}</strong></td>
          <td>
            <button class="btn btn-secondary btn-sm btn-quick-view-rider" data-id="${rider.id}">
              🔍 Details
            </button>
          </td>
        </tr>
      `;
    });

    return `
      <div class="card">
        <div class="section-header-bar">
          <div class="section-title-wrap">
            <h2>📡 Real-Time Rider Timestamps & Duty Status</h2>
            <p>Live timestamps received automatically when riders tap Start Day and End Day</p>
          </div>
          <div>
            <button class="btn btn-secondary btn-sm" id="btn-refresh-roster">
              🔄 Refresh Roster
            </button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Rider Info</th>
                <th>Hub / Station</th>
                <th>Status</th>
                <th>Shift Timestamps</th>
                <th>Elapsed Duty</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rosterRows || '<tr><td colspan="6" class="empty-state">No riders registered yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ==========================================
  // TAB 2: RIDER ACCOUNTS CRUD MANAGEMENT
  // ==========================================
  renderRidersCrudTab(riders) {
    const filteredRiders = riders.filter(r => {
      const q = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.riderId.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        r.hub.toLowerCase().includes(q)
      );
    });

    let rows = "";
    filteredRiders.forEach(rider => {
      rows += `
        <tr>
          <td>
            <div class="rider-cell">
              <div class="rider-avatar-sm">${rider.name.charAt(0)}</div>
              <div>
                <div class="rider-name-cell">${escapeHtml(rider.name)}</div>
                <div class="rider-id-sub">${escapeHtml(rider.phone)}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-burgundy">${escapeHtml(rider.riderId)}</span></td>
          <td>
            <code style="background: var(--burgundy-50); padding: 2px 6px; border-radius: 4px; color: var(--burgundy-900); font-weight: 700;">
              ${escapeHtml(rider.password)}
            </code>
          </td>
          <td>${escapeHtml(rider.vehicle || "Motorbike")}<br><small style="color: var(--text-muted);">${escapeHtml(rider.plateNumber || "")}</small></td>
          <td>${escapeHtml(rider.hub)}</td>
          <td>
            <div class="table-actions">
              <button class="icon-action-btn btn-edit-rider" title="Edit Rider" data-id="${rider.id}">
                ✏️
              </button>
              <button class="icon-action-btn delete btn-delete-rider" title="Delete Rider" data-id="${rider.id}">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    return `
      <div class="card">
        <div class="section-header-bar">
          <div class="section-title-wrap">
            <h2>👥 Rider Accounts & Credentials Management</h2>
            <p>Create, update, and manage login credentials and assigned hubs for all riders</p>
          </div>
          <div>
            <button class="btn btn-primary" id="btn-open-create-rider">
              ➕ Create Rider Account
            </button>
          </div>
        </div>

        <div class="filter-toolbar">
          <div class="search-input-wrap">
            <span class="search-icon">🔍</span>
            <input type="text" id="admin-search-riders" class="form-input" placeholder="Search by name, ID, phone, hub..." value="${escapeHtml(searchQuery)}">
          </div>
          <div style="font-size: 13px; color: var(--text-secondary);">
            Showing <strong>${filteredRiders.length}</strong> of ${riders.length} riders
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Rider Name & Phone</th>
                <th>Rider ID</th>
                <th>Password / PIN</th>
                <th>Vehicle & Plate</th>
                <th>Assigned Hub</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="6" class="empty-state">No matching riders found.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ==========================================
  // TAB 3: END-OF-DAY SHIFT REPORTS & RECONCILIATION
  // ==========================================
  renderReportsTab(shifts, riders) {
    let filteredShifts = shifts;

    if (selectedDateFilter) {
      filteredShifts = filteredShifts.filter(s => s.date === selectedDateFilter || s.startTimestamp?.startsWith(selectedDateFilter));
    }
    if (selectedRiderFilter !== "ALL") {
      filteredShifts = filteredShifts.filter(s => s.riderId === selectedRiderFilter || s.riderDocId === selectedRiderFilter);
    }

    // Totals for filtered records
    const totalCod = filteredShifts.reduce((sum, s) => sum + (parseFloat(s.codAmount) || 0), 0);
    const totalAssigned = filteredShifts.reduce((sum, s) => sum + (parseInt(s.assignedDeliveries) || 0), 0);
    const totalSuccessful = filteredShifts.reduce((sum, s) => sum + (parseInt(s.successfulDeliveries) || 0), 0);
    const totalPickups = filteredShifts.reduce((sum, s) => sum + (parseInt(s.pickupOrders) || 0), 0);

    let rows = "";
    filteredShifts.forEach(shift => {
      const startTime = new Date(shift.startTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endTime = shift.endTimestamp ? new Date(shift.endTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "In Progress";
      const duration = shift.durationMinutes ? `${Math.floor(shift.durationMinutes / 60)}h ${shift.durationMinutes % 60}m` : "Active";
      const successRate = shift.assignedDeliveries > 0 ? Math.round((shift.successfulDeliveries / shift.assignedDeliveries) * 100) : (shift.status === 'COMPLETED' ? 100 : 0);

      rows += `
        <tr>
          <td>
            <strong>${escapeHtml(shift.date || shift.startTimestamp?.split('T')[0])}</strong><br>
            <small style="color: var(--text-muted);">${startTime} - ${endTime}</small>
          </td>
          <td>
            <strong>${escapeHtml(shift.riderName)}</strong><br>
            <span class="badge badge-burgundy" style="font-size: 10px;">${escapeHtml(shift.riderId)}</span>
          </td>
          <td>
            <strong style="color: #065F46; font-size: 14px;">GH₵ ${Number(shift.codAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </td>
          <td>
            ${shift.successfulDeliveries || 0} / ${shift.assignedDeliveries || 0}
            <span style="font-size: 11px; color: ${successRate >= 90 ? '#065F46' : 'var(--amber-500)'}; font-weight: 700;">(${successRate}%)</span>
          </td>
          <td>
            <strong>${shift.pickupOrders || 0}</strong> orders
          </td>
          <td>${duration}</td>
          <td>
            <span class="badge ${shift.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}">
              ${shift.status}
            </span>
          </td>
          <td>
            <small style="color: var(--text-secondary); max-width: 140px; display: inline-block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(shift.notes || '')}">
              ${escapeHtml(shift.notes || "—")}
            </small>
          </td>
        </tr>
      `;
    });

    const riderOptions = riders.map(r => `
      <option value="${r.riderId}" ${selectedRiderFilter === r.riderId ? 'selected' : ''}>
        ${escapeHtml(r.riderId)} - ${escapeHtml(r.name)}
      </option>
    `).join("");

    return `
      <div class="card">
        <div class="section-header-bar">
          <div class="section-title-wrap">
            <h2>📑 End-of-Day Shift Submissions & COD Reconciliation</h2>
            <p>Complete record of rider shift starts, ends, COD collections, deliveries, and pickups</p>
          </div>
          <div class="filter-actions">
            <button class="btn btn-secondary btn-sm" id="btn-export-csv">
              📥 Export CSV (Excel)
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-print-reports">
              🖨️ Print Summary
            </button>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="filter-toolbar" style="background: var(--surface-card-subtle); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; flex: 1;">
            <div>
              <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block;">FILTER DATE</label>
              <input type="date" id="filter-report-date" class="form-input" style="padding: 6px 10px; font-size: 13px;" value="${selectedDateFilter}">
            </div>
            <div>
              <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block;">FILTER RIDER</label>
              <select id="filter-report-rider" class="form-select" style="padding: 6px 10px; font-size: 13px;">
                <option value="ALL">All Riders</option>
                ${riderOptions}
              </select>
            </div>
            ${(selectedDateFilter || selectedRiderFilter !== 'ALL') ? `
              <button class="btn btn-ghost btn-sm" id="btn-clear-report-filters" style="margin-top: 14px;">
                ✖ Clear Filters
              </button>
            ` : ''}
          </div>

          <div style="text-align: right; font-size: 12px; color: var(--burgundy-900); font-weight: 700;">
            Total Filtered COD: <span style="font-size: 15px; color: #065F46;">GH₵ ${totalCod.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> |
            Deliveries: <span>${totalSuccessful} / ${totalAssigned}</span> |
            Pickups: <span>${totalPickups}</span>
          </div>
        </div>

        <div class="table-responsive" style="margin-top: 14px;">
          <table class="data-table" id="table-reports-data">
            <thead>
              <tr>
                <th>Date & Shift Times</th>
                <th>Rider</th>
                <th>Total COD Under Care</th>
                <th>Successful / Assigned</th>
                <th>Pickup Orders</th>
                <th>Duty Time</th>
                <th>Status</th>
                <th>Rider Notes</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8" class="empty-state">No shift reports recorded matching the selected criteria.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ==========================================
  // EVENT HANDLERS & MODAL MANAGEMENT
  // ==========================================
  attachEventListeners(container) {
    // Tab Switching
    container.querySelectorAll(".admin-tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        activeTab = btn.getAttribute("data-tab");
        this.render(container);
      });
    });

    // Refresh Roster Button
    const refreshBtn = document.getElementById("btn-refresh-roster");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        this.render(container);
        window.dispatchEvent(new CustomEvent("watchdog-toast", {
          detail: { message: "Roster timestamps refreshed!", type: "info" }
        }));
      });
    }

    // Search Riders Input
    const searchInput = document.getElementById("admin-search-riders");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        const bodyEl = document.getElementById("admin-tab-container");
        if (bodyEl) {
          bodyEl.innerHTML = this.renderRidersCrudTab(store.getRiders());
          this.attachEventListeners(container);
        }
      });
    }

    // Open Create Rider Modal
    const openCreateBtn = document.getElementById("btn-open-create-rider");
    if (openCreateBtn) {
      openCreateBtn.addEventListener("click", () => {
        this.openCreateRiderModal();
      });
    }

    // Edit Rider Buttons
    container.querySelectorAll(".btn-edit-rider").forEach(btn => {
      btn.addEventListener("click", () => {
        const riderId = btn.getAttribute("data-id");
        this.openEditRiderModal(riderId);
      });
    });

    // Delete Rider Buttons
    container.querySelectorAll(".btn-delete-rider").forEach(btn => {
      btn.addEventListener("click", () => {
        const riderId = btn.getAttribute("data-id");
        this.openDeleteRiderModal(riderId);
      });
    });

    // Report Filter Listeners
    const filterDate = document.getElementById("filter-report-date");
    if (filterDate) {
      filterDate.addEventListener("change", (e) => {
        selectedDateFilter = e.target.value;
        this.render(container);
      });
    }

    const filterRider = document.getElementById("filter-report-rider");
    if (filterRider) {
      filterRider.addEventListener("change", (e) => {
        selectedRiderFilter = e.target.value;
        this.render(container);
      });
    }

    const clearFiltersBtn = document.getElementById("btn-clear-report-filters");
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener("click", () => {
        selectedDateFilter = "";
        selectedRiderFilter = "ALL";
        this.render(container);
      });
    }

    // Export CSV
    const exportBtn = document.getElementById("btn-export-csv");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        this.exportReportsToCsv();
      });
    }

    // Print Reports
    const printBtn = document.getElementById("btn-print-reports");
    if (printBtn) {
      printBtn.addEventListener("click", () => {
        window.print();
      });
    }
  },

  startLiveDurationTicker() {
    if (liveRosterInterval) clearInterval(liveRosterInterval);

    liveRosterInterval = setInterval(() => {
      document.querySelectorAll(".live-ticker-badge").forEach(el => {
        const startIso = el.getAttribute("data-start");
        if (startIso) {
          const diffMs = Math.max(0, Date.now() - new Date(startIso).getTime());
          const totalSecs = Math.floor(diffMs / 1000);
          const hours = Math.floor(totalSecs / 3600);
          const mins = Math.floor((totalSecs % 3600) / 60);
          const secs = totalSecs % 60;
          const pad = (n) => n.toString().padStart(2, '0');
          el.textContent = `⏱️ ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
        }
      });
    }, 1000);
  },

  // Modal Setup
  bindGlobalModals() {
    // Create / Edit Rider Form Submit
    const riderForm = document.getElementById("rider-crud-form");
    if (riderForm) {
      riderForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleSaveRider();
      });
    }

    // Confirm Delete Button
    const confirmDeleteBtn = document.getElementById("btn-confirm-delete-rider");
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener("click", async () => {
        if (deletingRiderId) {
          await store.deleteRider(deletingRiderId);
          document.getElementById("modal-delete-rider")?.classList.remove("active");
          deletingRiderId = null;
          window.dispatchEvent(new CustomEvent("watchdog-toast", {
            detail: { message: "Rider account deleted successfully.", type: "info" }
          }));
          this.render(document.getElementById("portal-content"));
        }
      });
    }
  },

  openCreateRiderModal() {
    editingRiderId = null;
    document.getElementById("rider-modal-title").textContent = "➕ Register New Rider Account";
    document.getElementById("rider-form-id-input").value = "RD-" + Math.floor(100 + Math.random() * 900);
    document.getElementById("rider-form-name").value = "";
    document.getElementById("rider-form-phone").value = "";
    document.getElementById("rider-form-password").value = "rider" + Math.floor(100 + Math.random() * 900);
    document.getElementById("rider-form-vehicle").value = "Motorbike";
    document.getElementById("rider-form-plate").value = "";
    document.getElementById("rider-form-hub").value = "Central Hub - Accra";

    document.getElementById("modal-rider-crud")?.classList.add("active");
  },

  openEditRiderModal(id) {
    const rider = store.getRiderById(id);
    if (!rider) return;

    editingRiderId = rider.id;
    document.getElementById("rider-modal-title").textContent = "✏️ Update Rider: " + rider.name;
    document.getElementById("rider-form-id-input").value = rider.riderId;
    document.getElementById("rider-form-name").value = rider.name;
    document.getElementById("rider-form-phone").value = rider.phone;
    document.getElementById("rider-form-password").value = rider.password;
    document.getElementById("rider-form-vehicle").value = rider.vehicle || "Motorbike";
    document.getElementById("rider-form-plate").value = rider.plateNumber || "";
    document.getElementById("rider-form-hub").value = rider.hub || "Central Hub - Accra";

    document.getElementById("modal-rider-crud")?.classList.add("active");
  },

  openDeleteRiderModal(id) {
    const rider = store.getRiderById(id);
    if (!rider) return;

    deletingRiderId = rider.id;
    document.getElementById("delete-rider-name-display").textContent = `${rider.name} (${rider.riderId})`;
    document.getElementById("modal-delete-rider")?.classList.add("active");
  },

  async handleSaveRider() {
    const riderIdVal = document.getElementById("rider-form-id-input").value.trim();
    const nameVal = document.getElementById("rider-form-name").value.trim();
    const phoneVal = document.getElementById("rider-form-phone").value.trim();
    const passwordVal = document.getElementById("rider-form-password").value.trim();
    const vehicleVal = document.getElementById("rider-form-vehicle").value;
    const plateVal = document.getElementById("rider-form-plate").value.trim();
    const hubVal = document.getElementById("rider-form-hub").value;

    if (!nameVal || !phoneVal || !passwordVal || !riderIdVal) {
      alert("Please fill in all required fields (Rider ID, Name, Phone, and Password).");
      return;
    }

    try {
      if (editingRiderId) {
        await store.updateRider(editingRiderId, {
          riderId: riderIdVal,
          name: nameVal,
          phone: phoneVal,
          password: passwordVal,
          vehicle: vehicleVal,
          plateNumber: plateVal,
          hub: hubVal
        });
        window.dispatchEvent(new CustomEvent("watchdog-toast", {
          detail: { message: `Rider ${nameVal} updated successfully!`, type: "success" }
        }));
      } else {
        await store.createRider({
          riderId: riderIdVal,
          name: nameVal,
          phone: phoneVal,
          password: passwordVal,
          vehicle: vehicleVal,
          plateNumber: plateVal,
          hub: hubVal
        });
        window.dispatchEvent(new CustomEvent("watchdog-toast", {
          detail: { message: `Rider ${nameVal} (${riderIdVal}) created!`, type: "success" }
        }));
      }

      document.getElementById("modal-rider-crud")?.classList.remove("active");
      this.render(document.getElementById("portal-content"));
    } catch (err) {
      alert("Error saving rider: " + err.message);
    }
  },

  exportReportsToCsv() {
    const shifts = store.getShifts();
    if (shifts.length === 0) {
      alert("No shift records available to export.");
      return;
    }

    const headers = [
      "Shift Date",
      "Rider ID",
      "Rider Name",
      "Rider Phone",
      "Start Timestamp",
      "End Timestamp",
      "Duration (Minutes)",
      "Total COD Collected (GHS)",
      "Assigned Deliveries",
      "Successful Deliveries",
      "Delivery Success Rate (%)",
      "Pickup Orders",
      "Shift Status",
      "Rider Notes"
    ];

    const rows = shifts.map(s => {
      const successRate = s.assignedDeliveries > 0 ? Math.round((s.successfulDeliveries / s.assignedDeliveries) * 100) : 100;
      return [
        `"${s.date || ''}"`,
        `"${s.riderId || ''}"`,
        `"${(s.riderName || '').replace(/"/g, '""')}"`,
        `"${s.riderPhone || ''}"`,
        `"${s.startTimestamp || ''}"`,
        `"${s.endTimestamp || ''}"`,
        s.durationMinutes || 0,
        (parseFloat(s.codAmount) || 0).toFixed(2),
        s.assignedDeliveries || 0,
        s.successfulDeliveries || 0,
        successRate + "%",
        s.pickupOrders || 0,
        `"${s.status || ''}"`,
        `"${(s.notes || '').replace(/"/g, '""')}"`
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `WatchDog_Shift_Reports_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.dispatchEvent(new CustomEvent("watchdog-toast", {
      detail: { message: "📥 Shift report CSV downloaded successfully!", type: "success" }
    }));
  }
};

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
