const admin = require('firebase-admin');
const path = require('path');

// Try to initialize Firebase, but don't fail if credentials are missing
let firebaseInitialized = false;

try {
  const serviceAccountPath = path.join(__dirname, 'comconnect-2b1d7-firebase-adminsdk-20r1n-c127902f6f.json');
  
  // Check if file exists and is not a directory
  const fs = require('fs');
  if (fs.existsSync(serviceAccountPath) && fs.statSync(serviceAccountPath).isFile()) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    console.warn('⚠️ Firebase credentials file not found or is a directory. Firebase features will be disabled.');
    console.warn('⚠️ To enable Firebase notifications, add the credentials file at:', serviceAccountPath);
  }
} catch (error) {
  console.warn('⚠️ Firebase initialization failed:', error.message);
  console.warn('⚠️ Firebase features will be disabled. Notifications will work without push notifications.');
}

// Export admin even if not initialized (will throw error if used, but allows service to start)
module.exports = {
  admin: firebaseInitialized ? admin : null,
  isInitialized: () => firebaseInitialized
};

