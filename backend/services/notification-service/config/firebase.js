const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, 'comconnect-2b1d7-firebase-adminsdk-20r1n-c127902f6f.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

module.exports = admin;

