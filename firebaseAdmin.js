const admin = require("firebase-admin");

// Parse the service account JSON from env variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "vattaram-63357.appspot.com" // Correct Firebase format
});

module.exports = admin;
