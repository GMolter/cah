// FIREBASE_BUILD 2025-09-01T06:05Z
export const build = "FIREBASE_BUILD 2025-09-01T06:05Z"; console.log(build);

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",
  authDomain: "olio-cardsagainsthumanity.firebaseapp.com",
  databaseURL: "https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com",
  projectId: "olio-cardsagainsthumanity",
  storageBucket: "olio-cardsagainsthumanity.firebasestorage.app",
  messagingSenderId: "256442998757",
  appId: "1:256442998757:web:ab26e55db0b5029879990c",
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Anonymous sign-in on boot
export const authReady = new Promise((resolve,reject)=>{
  onAuthStateChanged(auth, (u)=>{
    if (u) return resolve(u);
    signInAnonymously(auth).catch(reject);
  }, reject);
});
