(function () {
    "use strict";
  
    const firebaseConfig = window.FIREBASE_CONFIG;
  
    if (!firebaseConfig) {
      console.error("FIREBASE_CONFIG is not defined! Please make sure config.js is loaded.");
    }
  
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  
    window.db = firebase.firestore();
    window.auth = firebase.auth();
  })();
  