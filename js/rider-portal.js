// Rider Portal Logic - Start Day, Live Timer, End Day Modal, EOD Submission
import { store } from "./store.js";
import { auth } from "./auth.js";

let liveTimerInterval = null;
let liveClockInterval = null;
let currentRiderData = null;
let activeShift = null;

export const RiderPortal = {
  init() {
    this.bindEvents();
    this.startClock();
  },

  render(container) {
    const session = auth.getCurrentUser();
    if (!session || session.role !== "RIDER") {
      container.innerHTML = `<div class="empty-state"><h3>Please log in as a rider</h3></div>`;
      return;
    }

    currentRiderData = store.getRiderById(session.userId || session.riderId) || {
      name: session.name,
      riderId: session.riderId,
      hub: session.hub || "Central Hub",
      vehicle: session.vehicle || "Motorbike",
      phone: session.phone || ""
    };

    activeShift = store.getActiveShiftForRider(currentRiderData.riderId);
    const completedShifts = store.getShiftsForRider(currentRiderData.riderId);
    const todayIso = new Date().toISOString().split("T")[0];
    const todayCompletedShift = completedShifts.find(s => s.date === todayIso && s.status === "COMPLETED");

    let shiftStateHtml = "";

    if (activeShift) {
      // STATE 2: ON DUTY (ACTIVE SHIFT)
      const startTimeFormatted = new Date(activeShift.startTimestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });

      shiftStateHtml = `
        <div class="shift-action-card">
          <div class="shift-status-pill active pulse-badge">
            <span class="live-dot"></span> 🟢 On Duty (Active Shift)
          </div>

          <div class="active-shift-timer-box">
            <div class="timer-label">Live Shift Elapsed Time</div>
            <div class="live-elapsed-clock" id="rider-elapsed-clock">00:00:00</div>
            <div class="shift-start-stamp">
              <span>🕒 Started at: <strong>${startTimeFormatted}</strong></span>
              <span>• Status: <strong>Live to Admin</strong></span>
            </div>
          </div>

          <button id="btn-rider-end-day" class="btn-end-shift">
            <span class="btn-main-label">🏁 End Day / Close Shift</span>
            <span class="btn-sub-label">Submit Cash on Delivery & Order Counts</span>
          </button>
        </div>
      `;
    } else if (todayCompletedShift) {
      // STATE 3: COMPLETED FOR TODAY
      const startFormatted = new Date(todayCompletedShift.startTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endFormatted = new Date(todayCompletedShift.endTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const successRate = todayCompletedShift.assignedDeliveries > 0 
        ? Math.round((todayCompletedShift.successfulDeliveries / todayCompletedShift.assignedDeliveries) * 100)
        : 100;

      shiftStateHtml = `
        <div class="shift-action-card">
          <div class="shift-status-pill completed">
            ✅ Shift Closed for Today
          </div>

          <div class="completed-shift-banner">
            <h4 style="color: var(--burgundy-900); font-weight: 800; font-size: 15px; margin-bottom: 4px;">
              Today's Final Shift Summary
            </h4>
            <p style="font-size: 12px; color: var(--text-secondary);">
              Worked: <strong>${startFormatted} - ${endFormatted}</strong> (${Math.floor(todayCompletedShift.durationMinutes / 60)}h ${todayCompletedShift.durationMinutes % 60}m)
            </p>

            <div class="completed-grid">
              <div class="completed-stat-cell">
                <div class="label">Total COD in Care</div>
                <div class="value" style="color: #065F46;">GH₵ ${Number(todayCompletedShift.codAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
              <div class="completed-stat-cell">
                <div class="label">Deliveries Done</div>
                <div class="value">${todayCompletedShift.successfulDeliveries} / ${todayCompletedShift.assignedDeliveries} (${successRate}%)</div>
              </div>
              <div class="completed-stat-cell">
                <div class="label">Pickups Collected</div>
                <div class="value">${todayCompletedShift.pickupOrders} Orders</div>
              </div>
              <div class="completed-stat-cell">
                <div class="label">Admin Status</div>
                <div class="value" style="font-size: 13px; color: var(--burgundy-700);">✓ Reconciled</div>
              </div>
            </div>

            ${todayCompletedShift.notes ? `
              <div style="margin-top: 12px; font-size: 12px; background: #fff; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
                <strong>Notes:</strong> ${escapeHtml(todayCompletedShift.notes)}
              </div>
            ` : ''}
          </div>

          <div style="margin-top: 18px; display: flex; gap: 10px; justify-content: center;">
            <button id="btn-rider-start-new-shift" class="btn btn-secondary btn-sm">
              ➕ Start Another Shift
            </button>
          </div>
        </div>
      `;
    } else {
      // STATE 1: NOT STARTED / OFFLINE
      shiftStateHtml = `
        <div class="shift-action-card">
          <div class="shift-status-pill offline">
            ⚪ Shift Not Started
          </div>

          <p style="color: var(--text-secondary); font-size: 13.5px; margin-bottom: 24px;">
            Ready to hit the road? Tap below to record your official start timestamp and notify dispatch.
          </p>

          <button id="btn-rider-start-day" class="btn-start-shift">
            <span class="btn-main-label">🚀 Start Day</span>
            <span class="btn-sub-label">Clock in & send live timestamp to admin</span>
          </button>
        </div>
      `;
    }

    // Render Past Shifts History
    let historyRows = "";
    if (completedShifts.length > 0) {
      historyRows = completedShifts.slice(0, 5).map(s => {
        const dateFormatted = new Date(s.startTimestamp).toLocaleDateString([], { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
        const durationText = `${Math.floor(s.durationMinutes / 60)}h ${s.durationMinutes % 60}m`;
        return `
          <div class="history-item">
            <div>
              <div class="history-date">${dateFormatted}</div>
              <div class="history-time-meta">Duration: ${durationText} • ${s.status}</div>
            </div>
            <div class="history-metrics-pills">
              <span class="history-pill cod">COD GH₵ ${Number(s.codAmount || 0).toFixed(2)}</span>
              <span class="history-pill">${s.successfulDeliveries || 0}/${s.assignedDeliveries || 0} Del</span>
              <span class="history-pill">${s.pickupOrders || 0} Pickups</span>
            </div>
          </div>
        `;
      }).join("");
    } else {
      historyRows = `<div style="text-align: center; color: var(--text-muted); padding: 12px; font-size: 13px;">No past shifts recorded yet.</div>`;
    }

    container.innerHTML = `
      <div class="rider-view-container">
        <!-- Hero Header -->
        <div class="rider-hero-card">
          <div class="rider-hero-top">
            <div class="rider-avatar-wrap">
              <div class="rider-avatar-large">
                ${currentRiderData.name ? currentRiderData.name.charAt(0) : "R"}
              </div>
              <div class="rider-title-info">
                <h2>${escapeHtml(currentRiderData.name)}</h2>
                <div class="rider-meta-tags">
                  <span class="rider-id-pill">${escapeHtml(currentRiderData.riderId)}</span>
                  <span class="rider-hub-pill">${escapeHtml(currentRiderData.hub)}</span>
                  <span class="rider-hub-pill">${escapeHtml(currentRiderData.vehicle || "Motorbike")}</span>
                </div>
              </div>
            </div>

            <div class="rider-date-clock">
              <div class="rider-live-time" id="rider-header-clock">--:--:--</div>
              <div class="rider-live-date" id="rider-header-date">Loading...</div>
            </div>
          </div>
        </div>

        <!-- Shift Main Card -->
        ${shiftStateHtml}

        <!-- Recent History -->
        <div class="history-card">
          <div class="card-header" style="margin-bottom: 10px;">
            <h3 class="card-title" style="font-size: 15px;">📜 Recent Shift Submissions</h3>
            <span class="badge badge-burgundy">${completedShifts.length} Total</span>
          </div>
          <div>
            ${historyRows}
          </div>
        </div>
      </div>
    `;

    this.attachCardEventListeners();
    this.startLiveElapsedTimer();
  },

  startClock() {
    if (liveClockInterval) clearInterval(liveClockInterval);
    const updateTime = () => {
      const clockEl = document.getElementById("rider-header-clock");
      const dateEl = document.getElementById("rider-header-date");
      if (clockEl && dateEl) {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      }
    };
    updateTime();
    liveClockInterval = setInterval(updateTime, 1000);
  },

  startLiveElapsedTimer() {
    if (liveTimerInterval) clearInterval(liveTimerInterval);
    if (!activeShift) return;

    const timerEl = document.getElementById("rider-elapsed-clock");
    if (!timerEl) return;

    const startMs = new Date(activeShift.startTimestamp).getTime();

    const updateElapsed = () => {
      const diffMs = Math.max(0, Date.now() - startMs);
      const totalSecs = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;

      const pad = (n) => n.toString().padStart(2, '0');
      timerEl.textContent = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    };

    updateElapsed();
    liveTimerInterval = setInterval(updateElapsed, 1000);
  },

  attachCardEventListeners() {
    // Start Day Button
    const startBtn = document.getElementById("btn-rider-start-day");
    if (startBtn) {
      startBtn.addEventListener("click", async () => {
        try {
          startBtn.disabled = true;
          startBtn.innerHTML = `<span>⏳ Starting Day...</span>`;
          
          // Trigger vibration feedback if available
          if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
          }

          const shift = await store.startShift(currentRiderData.id || currentRiderData.riderId, {
            location: currentRiderData.hub
          });

          window.dispatchEvent(new CustomEvent("watchdog-toast", {
            detail: { 
              message: `🚀 Shift Started at ${new Date(shift.startTimestamp).toLocaleTimeString()}! Live timestamp sent to Admin.`, 
              type: "success" 
            }
          }));

          // Re-render
          this.render(document.getElementById("portal-content"));
        } catch (err) {
          alert("Could not start shift: " + err.message);
          startBtn.disabled = false;
        }
      });
    }

    // Start Another Shift Button
    const restartBtn = document.getElementById("btn-rider-start-new-shift");
    if (restartBtn) {
      restartBtn.addEventListener("click", async () => {
        if (confirm("Do you want to start another shift for today?")) {
          const shift = await store.startShift(currentRiderData.id || currentRiderData.riderId, {
            location: currentRiderData.hub
          });
          window.dispatchEvent(new CustomEvent("watchdog-toast", {
            detail: { message: "🚀 New shift started and sent to Admin!", type: "success" }
          }));
          this.render(document.getElementById("portal-content"));
        }
      });
    }

    // End Day Button -> Opens EOD Modal
    const endBtn = document.getElementById("btn-rider-end-day");
    if (endBtn) {
      endBtn.addEventListener("click", () => {
        this.openEndDayModal();
      });
    }
  },

  openEndDayModal() {
    const modalBackdrop = document.getElementById("modal-end-day");
    if (!modalBackdrop) return;

    // Reset Form fields
    document.getElementById("eod-form-cod").value = "";
    document.getElementById("eod-form-assigned").value = "";
    document.getElementById("eod-form-successful").value = "";
    document.getElementById("eod-form-pickups").value = "";
    document.getElementById("eod-form-notes").value = "";
    document.getElementById("eod-success-rate-val").textContent = "0%";
    document.getElementById("eod-pending-val").textContent = "0";

    modalBackdrop.classList.add("active");
    setTimeout(() => {
      document.getElementById("eod-form-cod")?.focus();
    }, 100);
  },

  bindEvents() {
    // EOD Real-time calculation listener
    const assignedInput = document.getElementById("eod-form-assigned");
    const successInput = document.getElementById("eod-form-successful");

    const updateCalc = () => {
      const assigned = parseInt(assignedInput.value, 10) || 0;
      const success = parseInt(successInput.value, 10) || 0;

      const rateEl = document.getElementById("eod-success-rate-val");
      const pendingEl = document.getElementById("eod-pending-val");

      if (assigned > 0) {
        const rate = Math.min(100, Math.round((success / assigned) * 100));
        rateEl.textContent = `${rate}%`;
        pendingEl.textContent = Math.max(0, assigned - success);
      } else {
        rateEl.textContent = "0%";
        pendingEl.textContent = "0";
      }
    };

    if (assignedInput && successInput) {
      assignedInput.addEventListener("input", updateCalc);
      successInput.addEventListener("input", updateCalc);
    }

    // EOD Submit Form
    const eodForm = document.getElementById("eod-modal-form");
    if (eodForm) {
      eodForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleEodSubmit();
      });
    }
  },

  async handleEodSubmit() {
    const codAmount = parseFloat(document.getElementById("eod-form-cod").value);
    const assigned = parseInt(document.getElementById("eod-form-assigned").value, 10);
    const successful = parseInt(document.getElementById("eod-form-successful").value, 10);
    const pickups = parseInt(document.getElementById("eod-form-pickups").value, 10);
    const notes = document.getElementById("eod-form-notes").value;

    // Validation
    if (isNaN(codAmount) || codAmount < 0) {
      alert("Please enter a valid Cash on Delivery (COD) amount (0 or more).");
      return;
    }
    if (isNaN(assigned) || assigned < 0) {
      alert("Please enter the total Assigned Deliveries count.");
      return;
    }
    if (isNaN(successful) || successful < 0) {
      alert("Please enter the Successful Deliveries count.");
      return;
    }
    if (successful > assigned) {
      alert("Successful deliveries cannot be greater than assigned deliveries.");
      return;
    }
    if (isNaN(pickups) || pickups < 0) {
      alert("Please enter the Pickup Orders count (0 or more).");
      return;
    }

    const submitBtn = document.getElementById("btn-submit-eod");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>⏳ Submitting to Admin...</span>`;
    }

    try {
      const shiftId = activeShift ? activeShift.id : "shift_" + Date.now();
      const riderId = currentRiderData.id || currentRiderData.riderId;

      await store.endShift(shiftId, riderId, {
        codAmount,
        assignedDeliveries: assigned,
        successfulDeliveries: successful,
        pickupOrders: pickups,
        notes
      });

      // Close modal
      document.getElementById("modal-end-day")?.classList.remove("active");

      // Audio / Vibration feedback
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }

      window.dispatchEvent(new CustomEvent("watchdog-toast", {
        detail: { 
          message: "🏁 Shift Closed & All data (COD, Deliveries, Pickups) submitted to Admin!", 
          type: "success" 
        }
      }));

      // Re-render
      this.render(document.getElementById("portal-content"));
    } catch (err) {
      alert("Failed to submit shift data: " + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Submit & Close Day</span>`;
      }
    }
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
