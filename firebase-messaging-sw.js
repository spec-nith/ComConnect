importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js');

console.log('🔥 Service Worker Loading...');

const firebaseConfig = {
  apiKey: "AIzaSyC2ZYTLEBAcMvmYa5fhQdDoUrcWa9YzdTA",
  authDomain: "comconnect-2b1d7.firebaseapp.com",
  projectId: "comconnect-2b1d7",
  storageBucket: "comconnect-2b1d7.firebasestorage.app",
  messagingSenderId: "854170103458",
  appId: "1:854170103458:web:9661dd687bcdf4e12db1fb",
  measurementId: "G-EHQ1LTCGJS"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
console.log('✅ Firebase initialized in SW');

// Initialize Firebase Cloud Messaging and get a reference to the service
const messaging = firebase.messaging();
console.log('✅ Messaging initialized in SW');

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('👋 Received background message:', payload);

  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png',
    badge: '/badge.png',
    data: payload.data || {},
    requireInteraction: true,
    vibrate: [200, 100, 200]
  };

  console.log('📣 Showing notification with options:', notificationOptions);

  return self.registration.showNotification(
    payload.notification.title,
    notificationOptions
  ).then(() => {
    console.log('✅ Notification shown successfully');
  }).catch(error => {
    console.error('❌ Error showing notification:', error);
  });
});

self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installed');
});

self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activated');
});

self.addEventListener('push', function(event) {
  console.log('Push message received:', event);
  
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.notification.body,
      icon: data.notification.icon || '/icon.png',
      badge: '/badge.png',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      tag: `chat-${data.data?.chatId || Date.now()}`,
      renotify: true,
      data: data.data,
      actions: [
        {
          action: 'open',
          title: 'Open Chat'
        },
        {
          action: 'reply',
          title: 'Reply'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.notification.title, options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  console.log('Notification clicked:', event);

  const notification = event.notification;
  const action = event.action;
  const data = notification.data;

  notification.close();

  if (action === 'reply') {
    // Handle reply action
    // You might want to store this information to open reply box when app opens
    clients.openWindow(`/chat/${data.chatId}?reply=true`);
    return;
  }

  // Default action is to open the chat
  const urlToOpen = new URL(`/chat/${data.chatId}`, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(function(clientList) {
      // If we have a client, focus it and navigate
      for (let client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (client.navigate) {
            return client.navigate(urlToOpen);
          }
          return;
        }
      }
      // If no client, open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title, event.data.options)
      .then(() => console.log('Notification shown via postMessage'))
      .catch(error => console.error('Error showing notification:', error));
  }
});