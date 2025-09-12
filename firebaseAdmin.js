const admin = require("firebase-admin");
const serviceAccount = require(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
storageBucket: "vattaram-63357.firebasestorage.app"
});

module.exports = admin;

