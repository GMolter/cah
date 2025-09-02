// FIREBASE_BUILD 2025-09-01T07:25Z
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  onDisconnect,
  remove,
  update,
  push,
  child
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

/**
 * Your web app's Firebase configuration (verbatim from you, with databaseURL added).
 * storageBucket here uses the standard appspot.com domain (works fine with RTDB/Auth).
 */
const firebaseConfig = {
  apiKey: "AIzaSyAe7u7Ij4CQUrWUDirzEZo0hyEPwjXO_uI",
  authDomain: "olio-cardsagainsthumanity.firebaseapp.com",
  databaseURL: "https://olio-cardsagainsthumanity-default-rtdb.firebaseio.com",
  projectId: "olio-cardsagainsthumanity",
  storageBucket: "olio-cardsagainsthumanity.appspot.com",
  messagingSenderId: "256442998757",
  appId: "1:256442998757:web:ab26e55db0b5029879990c"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

/** Resolves once we have an anonymous user (or existing user). */
export const authReady = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      resolve(user);
    } else {
      signInAnonymously(auth)
        .then((cred) => resolve(cred.user))
        .catch(reject);
    }
  }, reject);
});

// Useful re-exports
export { ref, set, get, onValue, onDisconnect, remove, update, push, child };
