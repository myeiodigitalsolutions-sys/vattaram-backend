const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true, sparse: true },
  phone: { type: String, trim: true, sparse: true },
  isVerified: { type: Boolean, default: false },
  uid: { type: String, unique: true },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  otpHash: { type: String }, // Stores the hashed OTP for phone-based authentication
  otpCreatedAt: { type: Date, expires: 300 }, // TTL for OTP (5 minutes)
  authMethod: { 
    type: String, 
    enum: ['firebase', 'email', 'phone', 'google'], 
    required: true 
  }, // Tracks authentication method
  isAdmin: { type: Boolean, default: false }, // Add isAdmin field
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: { updatedAt: 'updatedAt' } // Automatically manage updatedAt
});

// Ensure non-unique sparse index for email, unique sparse index for phone
userSchema.index({ email: 1 }, { sparse: true }); // Removed unique: true
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

// Export the model, reusing it if already defined
module.exports = mongoose.models.User || mongoose.model('User', userSchema);