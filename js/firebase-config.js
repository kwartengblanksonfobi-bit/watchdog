// Firebase Configuration & SDK Initialization for WatchDog PWA
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBzDEhaAu8rWX5upK3iZi4tvBmuL6HG8bU",
  authDomain: "digisiren-pa-system.firebaseapp.com",
  projectId: "digisiren-pa-system",
  storageBucket: "digisiren-pa-system.firebasestorage.app",
  messagingSenderId: "859846924984",
  appId: "1:859846924984:web:4c99a06fe13de42a72724d"
};

let app = null;
let db = null;
let isFirestoreAvailable = false;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  isFirestoreAvailable = true;
  console.log("🔥 WatchDog Firebase successfully initialized with project:", firebaseConfig.projectId);
} catch (error) {
  console.warn("⚠️ Firebase init fallback: running in local resilient mode", error);
  isFirestoreAvailable = false;
}

export { 
  app, 
  db, 
  isFirestoreAvailable,
  collection, 
  doc, 
  getDoc,
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
};
