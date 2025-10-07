const admin = require("firebase-admin");

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error('Error parsing FIREBASE_SERVICE_ACCOUNT:', err.message);
  throw new Error('Invalid Firebase service account configuration');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "vattaram-63357.appspot.com" // Use the correct bucket name
});