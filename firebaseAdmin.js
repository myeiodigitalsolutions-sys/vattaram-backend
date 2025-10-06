const admin = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.Service_key);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
storageBucket: "vattaram-63357.firebasestorage.app"
});

module.exports = admin;

