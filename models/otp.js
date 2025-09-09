const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  otpHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 }  // 5 min TTL
});

module.exports = mongoose.model('OTP', otpSchema);