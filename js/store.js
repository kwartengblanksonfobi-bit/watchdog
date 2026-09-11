// Data Store Layer for WatchDog PWA (Firestore + Local Sync)
import { 
  db, 
  isFirestoreAvailable, 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot 
} from "./firebase-config.js";

const RIDERS_COLLECTION = "watchdog_riders";
const SHIFTS_COLLECTION = "watchdog_shifts";
const LOCAL_STORAGE_KEY_RIDERS = "watchdog_local_riders_v1";
const LOCAL_STORAGE_KEY_SHIFTS = "watchdog_local_shifts_v1";

// Initial Demo Seed Data
const DEFAULT_RIDERS = [
  {
    id: "rider_rd001",
    riderId: "RD-001",
    name: "Kofi Mensah",
    phone: "+233 24 555 1201",
    password: "rider123",
    vehicle: "Motorbike (Royal 150)",
    plateNumber: "M-22-GR-4190",
    hub: "Central Hub - Accra",
    currentStatus: "OFFLINE", // OFFLINE, ON_DUTY, COMPLETED_TODAY
    activeShiftId: null,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: "rider_rd002",
    riderId: "RD-002",
    name: "Ama Serwaa",
    phone: "+233 50 888 3492",
    password: "rider123",
    vehicle: "Motorbike (Honda Ace)",
    plateNumber: "M-23-AS-8102",
    hub: "East Airport Hub",
    currentStatus: "OFFLINE",
    activeShiftId: null,
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString()
  },
  {
    id: "rider_rd003",
    riderId: "RD-003",
    name: "Ibrahim Diallo",
    phone: "+233 27 111 9830",
    password: "rider123",
    vehicle: "Delivery Van (Suzuki)",
    plateNumber: "GT-9201-21",
    hub: "Tema Logistics Yard",
    currentStatus: "OFFLINE",
    activeShiftId: null,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString()
  }
];

class DataStore {
  constructor() {
    this.riders = this.loadLocalRiders();
    this.shifts = this.loadLocalShifts();
    this.ridersListeners = [];
    this.shiftsListeners = [];
    this.initFirestoreSync();
  }

  // Local Storage Helpers
  loadLocalRiders() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_RIDERS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Error reading local riders:", e);
    }
    // Seed default riders
    this.saveLocalRiders(DEFAULT_RIDERS);
    return DEFAULT_RIDERS;
  }

  saveLocalRiders(riders) {
    this.riders = riders;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_RIDERS, JSON.stringify(riders));
    } catch (e) {
      console.warn("Error saving local riders:", e);
    }
    this.notifyRidersChanged();
  }

  loadLocalShifts() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_SHIFTS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Error reading local shifts:", e);
    }
    return [];
  }

  saveLocalShifts(shifts) {
    this.shifts = shifts;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_SHIFTS, JSON.stringify(shifts));
    } catch (e) {
      console.warn("Error saving local shifts:", e);
    }
    this.notifyShiftsChanged();
  }

  // Real-time Firestore Sync
  initFirestoreSync() {
    if (!isFirestoreAvailable || !db) return;

    try {
      // 1. Sync Riders Collection
      const ridersRef = collection(db, RIDERS_COLLECTION);
      onSnapshot(ridersRef, (snapshot) => {
        if (!snapshot.empty) {
          const remoteRiders = [];
          snapshot.forEach((docSnap) => {
            remoteRiders.push({ id: docSnap.id, ...docSnap.data() });
          });
          // Merge remote riders with local store
          this.saveLocalRiders(remoteRiders);
        } else {
          // If Firestore is empty, seed it with default riders
          this.seedFirestoreDefaultRiders();
        }
      }, (error) => {
        console.warn("Firestore riders subscription warning (using local fallback):", error.message);
      });

      // 2. Sync Shifts Collection
      const shiftsRef = collection(db, SHIFTS_COLLECTION);
      onSnapshot(shiftsRef, (snapshot) => {
        if (!snapshot.empty) {
          const remoteShifts = [];
          snapshot.forEach((docSnap) => {
            remoteShifts.push({ id: docSnap.id, ...docSnap.data() });
          });
          this.saveLocalShifts(remoteShifts);
        }
      }, (error) => {
        console.warn("Firestore shifts subscription warning (using local fallback):", error.message);
      });

    } catch (e) {
      console.warn("Firestore listener setup note:", e);
    }
  }

  async seedFirestoreDefaultRiders() {
    if (!isFirestoreAvailable || !db) return;
    try {
      for (const rider of DEFAULT_RIDERS) {
        const riderRef = doc(db, RIDERS_COLLECTION, rider.id);
        await setDoc(riderRef, rider);
      }
    } catch (err) {
      console.warn("Seed to firestore note:", err.message);
    }
  }

  // Observer Subscriptions
  subscribeRiders(callback) {
    this.ridersListeners.push(callback);
    callback(this.riders);
    return () => {
      this.ridersListeners = this.ridersListeners.filter(cb => cb !== callback);
    };
  }

  subscribeShifts(callback) {
    this.shiftsListeners.push(callback);
    callback(this.shifts);
    return () => {
      this.shiftsListeners = this.shiftsListeners.filter(cb => cb !== callback);
    };
  }

  notifyRidersChanged() {
    this.ridersListeners.forEach(cb => cb(this.riders));
  }

  notifyShiftsChanged() {
    this.shiftsListeners.forEach(cb => cb(this.shifts));
  }

  // ==========================================
  // RIDER CRUD OPERATIONS (Admin & Rider Auth)
  // ==========================================

  getRiders() {
    return [...this.riders];
  }

  getRiderById(id) {
    return this.riders.find(r => r.id === id || r.riderId === id);
  }

  getRiderByCredentials(riderIdOrPhone, password) {
    const cleanId = (riderIdOrPhone || "").trim().toUpperCase();
    return this.riders.find(r => 
      (r.riderId.toUpperCase() === cleanId || r.phone.replace(/\s+/g, '') === cleanId.replace(/\s+/g, '')) &&
      r.password === password
    );
  }

  async createRider(riderData) {
    const newId = "rider_" + Date.now();
    const newRider = {
      id: newId,
      riderId: (riderData.riderId || "RD-" + Math.floor(100 + Math.random() * 900)).toUpperCase().trim(),
      name: riderData.name.trim(),
      phone: riderData.phone.trim(),
      password: riderData.password || "rider123",
      vehicle: riderData.vehicle || "Motorbike",
      plateNumber: (riderData.plateNumber || "N/A").trim().toUpperCase(),
      hub: riderData.hub || "Main Station",
      currentStatus: "OFFLINE",
      activeShiftId: null,
      createdAt: new Date().toISOString()
    };

    const updated = [newRider, ...this.riders];
    this.saveLocalRiders(updated);

    if (isFirestoreAvailable && db) {
      try {
        await setDoc(doc(db, RIDERS_COLLECTION, newId), newRider);
      } catch (err) {
        console.warn("Firestore createRider sync warning:", err);
      }
    }

    return newRider;
  }

  async updateRider(id, updateData) {
    const updated = this.riders.map(r => {
      if (r.id === id || r.riderId === id) {
        return { 
          ...r, 
          ...updateData, 
          updatedAt: new Date().toISOString() 
        };
      }
      return r;
    });

    this.saveLocalRiders(updated);

    if (isFirestoreAvailable && db) {
      try {
        const target = this.riders.find(r => r.id === id || r.riderId === id);
        if (target) {
          await updateDoc(doc(db, RIDERS_COLLECTION, target.id), {
            ...updateData,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn("Firestore updateRider sync warning:", err);
      }
    }

    return this.getRiderById(id);
  }

  async deleteRider(id) {
    const target = this.riders.find(r => r.id === id || r.riderId === id);
    if (!target) return false;

    const updated = this.riders.filter(r => r.id !== target.id);
    this.saveLocalRiders(updated);

    if (isFirestoreAvailable && db) {
      try {
        await deleteDoc(doc(db, RIDERS_COLLECTION, target.id));
      } catch (err) {
        console.warn("Firestore deleteRider sync warning:", err);
      }
    }

    return true;
  }

  // Create a fully-completed shift record manually (admin backfill for late-onboarded riders)
  async createManualShift(riderId, shiftData) {
    const rider = this.getRiderById(riderId);
    if (!rider) throw new Error("Rider not found");

    const shiftId = "shift_manual_" + Date.now();

    // Build ISO timestamps from date + time strings
    const dateStr    = shiftData.date;           // "YYYY-MM-DD"
    const startTime  = shiftData.startTime || "08:00";
    const endTime    = shiftData.endTime   || "17:00";
    const startIso   = new Date(`${dateStr}T${startTime}:00`).toISOString();
    const endIso     = new Date(`${dateStr}T${endTime}:00`).toISOString();
    const startMs    = new Date(startIso).getTime();
    const endMs      = new Date(endIso).getTime();
    const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
    const nowIso     = new Date().toISOString();

    const manualShift = {
      id:                   shiftId,
      riderId:              rider.riderId,
      riderDocId:           rider.id,
      riderName:            rider.name,
      riderPhone:           rider.phone,
      vehicle:              rider.vehicle,
      hub:                  rider.hub,
      date:                 dateStr,
      startTimestamp:       startIso,
      endTimestamp:         endIso,
      durationMinutes:      durationMinutes,
      status:               "COMPLETED",
      codAmount:            parseFloat(shiftData.codAmount || 0),
      assignedDeliveries:   parseInt(shiftData.assignedDeliveries || 0, 10),
      successfulDeliveries: parseInt(shiftData.successfulDeliveries || 0, 10),
      pickupOrders:         parseInt(shiftData.pickupOrders || 0, 10),
      notes:                (shiftData.notes || "").trim(),
      locationStart:        rider.hub,
      isManualEntry:        true,
      createdByAdmin:       true,
      submittedAt:          nowIso,
      createdAt:            nowIso
    };

    const updatedShifts = [manualShift, ...this.shifts];
    this.saveLocalShifts(updatedShifts);

    if (isFirestoreAvailable && db) {
      try {
        await setDoc(doc(db, SHIFTS_COLLECTION, shiftId), manualShift);
      } catch (err) {
        console.warn("Firestore createManualShift sync warning:", err);
      }
    }

    return manualShift;
  }


  // ==========================================
  // SHIFT & ATTENDANCE LOG OPERATIONS
  // ==========================================

  getShifts() {
    return [...this.shifts].sort((a, b) => new Date(b.startTimestamp) - new Date(a.startTimestamp));
  }

  getShiftsForRider(riderId) {
    return this.shifts
      .filter(s => s.riderId === riderId || s.riderDocId === riderId)
      .sort((a, b) => new Date(b.startTimestamp) - new Date(a.startTimestamp));
  }

  getActiveShiftForRider(riderId) {
    return this.shifts.find(s => 
      (s.riderId === riderId || s.riderDocId === riderId) && 
      s.status === "ACTIVE"
    );
  }

  async startShift(riderId, shiftMeta = {}) {
    const rider = this.getRiderById(riderId);
    if (!rider) throw new Error("Rider not found");

    const shiftId = "shift_" + Date.now();
    const nowIso = new Date().toISOString();

    const newShift = {
      id: shiftId,
      riderId: rider.riderId,
      riderDocId: rider.id,
      riderName: rider.name,
      riderPhone: rider.phone,
      vehicle: rider.vehicle,
      hub: rider.hub,
      date: nowIso.split("T")[0],
      startTimestamp: nowIso,
      endTimestamp: null,
      durationMinutes: 0,
      status: "ACTIVE", // ACTIVE | COMPLETED
      codAmount: 0,
      assignedDeliveries: 0,
      successfulDeliveries: 0,
      pickupOrders: 0,
      notes: "",
      locationStart: shiftMeta.location || "Default Station",
      createdAt: nowIso
    };

    // Update Shifts
    const updatedShifts = [newShift, ...this.shifts];
    this.saveLocalShifts(updatedShifts);

    // Update Rider State
    await this.updateRider(rider.id, {
      currentStatus: "ON_DUTY",
      activeShiftId: shiftId,
      lastShiftStart: nowIso
    });

    if (isFirestoreAvailable && db) {
      try {
        await setDoc(doc(db, SHIFTS_COLLECTION, shiftId), newShift);
      } catch (err) {
        console.warn("Firestore startShift sync warning:", err);
      }
    }

    return newShift;
  }

  async endShift(shiftId, riderId, eodData) {
    const shift = this.shifts.find(s => s.id === shiftId);
    const rider = this.getRiderById(riderId);

    const nowIso = new Date().toISOString();
    const startMs = shift ? new Date(shift.startTimestamp).getTime() : Date.now() - 3600000;
    const endMs = new Date(nowIso).getTime();
    const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));

    const updatedShiftData = {
      ...(shift || {}),
      id: shiftId,
      riderId: rider ? rider.riderId : (shift?.riderId || "RD-N/A"),
      riderDocId: rider ? rider.id : (shift?.riderDocId || ""),
      riderName: rider ? rider.name : (shift?.riderName || "Rider"),
      endTimestamp: nowIso,
      durationMinutes: durationMinutes,
      status: "COMPLETED",
      codAmount: parseFloat(eodData.codAmount || 0),
      assignedDeliveries: parseInt(eodData.assignedDeliveries || 0, 10),
      successfulDeliveries: parseInt(eodData.successfulDeliveries || 0, 10),
      pickupOrders: parseInt(eodData.pickupOrders || 0, 10),
      notes: (eodData.notes || "").trim(),
      submittedAt: nowIso
    };

    const updatedShifts = this.shifts.map(s => s.id === shiftId ? updatedShiftData : s);
    // If shift wasn't in array, add it
    if (!this.shifts.find(s => s.id === shiftId)) {
      updatedShifts.unshift(updatedShiftData);
    }
    this.saveLocalShifts(updatedShifts);

    // Update Rider State
    if (rider) {
      await this.updateRider(rider.id, {
        currentStatus: "COMPLETED_TODAY",
        activeShiftId: null,
        lastShiftEnd: nowIso,
        lastEodReport: {
          shiftId: shiftId,
          codAmount: updatedShiftData.codAmount,
          successfulDeliveries: updatedShiftData.successfulDeliveries,
          assignedDeliveries: updatedShiftData.assignedDeliveries,
          pickupOrders: updatedShiftData.pickupOrders,
          submittedAt: nowIso
        }
      });
    }

    if (isFirestoreAvailable && db) {
      try {
        await setDoc(doc(db, SHIFTS_COLLECTION, shiftId), updatedShiftData);
      } catch (err) {
        console.warn("Firestore endShift sync warning:", err);
      }
    }

    return updatedShiftData;
  }
}

export const store = new DataStore();
