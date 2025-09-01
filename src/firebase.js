// /src/firebase.js
export const BUILD = "FIREBASE_BUILD 2025-09-01T06:20Z";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
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
export const db = getDatabase(app);

// Persist auth so a refresh doesn't drop you
await setPersistence(auth, browserLocalPersistence);

export const authReady = new Promise((resolve, reject)=>{
  let settled = false;
  onAuthStateChanged(auth, async (u)=>{
    try{
      if(!u){
        console.log("[auth] signing in anonymously…");
        await signInAnonymously(auth);
      }else{
        console.log("[auth] signed in as", u.uid);
      }
      if(!settled){ settled = true; resolve(true); }
    }catch(e){
      console.error("[auth] signInAnonymously failed", e);
      if(!settled){ settled = true; reject(e); }
    }
  }, (err)=>{
    console.error("[auth] onAuthStateChanged error", err);
    if(!settled){ settled = true; reject(err); }
  });
});
