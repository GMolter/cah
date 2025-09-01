// FIREBASE_BUILD 2025-09-01T06:15Z
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

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

// fast anon sign-in w/ promise
export const authReady = new Promise((resolve, reject)=>{
  let settled = false;
  onAuthStateChanged(auth, (user)=>{
    if (user && !settled) { settled = true; resolve(user); }
  });
  signInAnonymously(auth).catch((e)=>{ if(!settled){ settled = true; reject(e); } });
});
