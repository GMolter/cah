// firebase.js
export const BUILD = "FIREBASE_BUILD 2025-09-01T06:05Z";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

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
export const db  = getDatabase(app);
export const auth = getAuth(app);

// Ensure we persist across refresh (and auto-resume)
await setPersistence(auth, browserLocalPersistence);

const _ready = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, async (u) => {
    try{
      if(!u) await signInAnonymously(auth);
      resolve(true);
    }catch(e){
      console.error("[firebase] signInAnonymously failed", e);
      reject(e);
    }
  }, (err)=> reject(err));
});

export const authReady = _ready;
console.log(BUILD);
