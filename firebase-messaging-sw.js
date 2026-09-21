// Import Firebase scripts into the Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize Firebase with your project config
firebase.initializeApp({
    apiKey: "AIzaSyDj-2kVhmOOsYxKp9ChB2ATmJMiQvPysrA",
    authDomain: "vibe-chat-ee27e.firebaseapp.com",
    projectId: "vibe-chat-ee27e",
    storageBucket: "vibe-chat-ee27e.firebasestorage.app",
    messagingSenderId: "891909676621",
    appId: "1:891909676621:web:97cd033dac7cfb10fb4604",
    measurementId: "G-304XJYYHEG"
});

const messaging = firebase.messaging();

// Background message handler (Runs when app is closed or running in background)
messaging.onBackgroundMessage((payload) => {
    console.log("Background message received: ", payload);
    
    const notificationTitle = payload.notification.title || "VibeChat Notification";
    const notificationOptions = {
        body: payload.notification.body || "You have a new message.",
        icon: 'https://cdn-icons-png.flaticon.com/512/733/733585.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
