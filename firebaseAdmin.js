const admin = require("firebase-admin");
const serviceAccount = require(process.env.Firebaseconfig);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
storageBucket: "vattaram-63357.firebasestorage.app"
});

module.exports = admin;

