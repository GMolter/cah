/* FIREBASE_BUILD */ console.log("FIREBASE_BUILD", new Date().toISOString());

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// 🔑 your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",
  authDomain: "olio-cardsagainsthumanity.firebaseapp.com",
  projectId: "olio-cardsagainsthumanity",
  storageBucket: "olio-cardsagainsthumanity.firebasestorage.app",
  messagingSenderId: "256442998757",
  appId: "1:256442998757:web:ab26e55db0b5029879990c",
  databaseURL: "https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getDatabase(app);

export const authReady = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, (u) => {
    if (u) {
      console.log("[firebase] authReady", u.uid);
      resolve(u);
    }
  }, reject);

  signInAnonymously(auth).catch((err) => {
    console.error("[firebase] anon sign-in failed", err);
    reject(err);
  });
});
