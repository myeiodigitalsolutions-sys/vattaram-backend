const axios = require('axios');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const User = require('../models/User');
const fast2sms = require('fast-two-sms');
const bcrypt = require('bcryptjs');

// Send OTP
exports.sendOTP = async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    console.error('Phone number missing in request');
    return res.status(400).json({ message: 'Phone number required' });
  }

  // Clean phone number (remove +91 and non-digits)
  const cleanPhone = phone.replace('+91', '').replace(/\D/g, '');

  if (cleanPhone.length !== 10) {
    console.error('Invalid phone number format:', cleanPhone);
    return res.status(400).json({ message: 'Invalid phone number' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 10);

  try {
    // Check if user exists with this phone number
    let user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      // Create a new user if none exists, omitting email field
      user = new User({
        phone: cleanPhone,
        authMethod: 'phone',
        uid: `phone-${cleanPhone}`,
        name: cleanPhone, // Default name to phone number
      });
    }

    // Update OTP fields
    user.otpHash = otpHash;
    user.otpCreatedAt = new Date();
    await user.save();

    console.log('User saved successfully for phone:', cleanPhone);

    // Fast2SMS API call
    if (!process.env.FAST2SMS_API_KEY) {
      console.error('FAST2SMS_API_KEY is not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'SMS service not configured', 
        otp: process.env.NODE_ENV === 'development' ? otp : undefined 
      });
    }

    console.log('Attempting to send OTP to:', cleanPhone);

    try {
      const response = await axios.post(
        'https://www.fast2sms.com/dev/bulkV2',
        {
          route: 'otp',
          numbers: cleanPhone,
          variables_values: otp,
          flash: 0,
        },
        {
          headers: {
            authorization: process.env.FAST2SMS_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      console.log('Fast2SMS API Response:', response.data);

      if (response.data.return) {
        res.json({ 
          success: true, 
          message: 'OTP sent successfully via SMS' 
        });
      } else {
        throw new Error(response.data.message || 'Failed to send OTP');
      }
    } catch (apiError) {
      console.error('Fast2SMS API Error:', {
        message: apiError.message,
        response: apiError.response?.data,
        phone: cleanPhone
      });

      // Fallback: Return OTP in development mode for testing
      if (process.env.NODE_ENV === 'development') {
        return res.status(500).json({ 
          success: false, 
          message: `Failed to send SMS: ${apiError.message}`, 
          otp: otp 
        });
      } else {
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to send SMS. Please try again.' 
        });
      }
    }
  } catch (error) {
    console.error('SMS Sending Failed:', {
      message: error.message,
      stack: error.stack,
      phone: cleanPhone,
      operation: 'user-save'
    });
    res.status(500).json({ 
      success: false,
      message: 'Failed to send SMS. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    console.error('Missing phone or OTP in request');
    return res.status(400).json({ message: 'Phone and OTP required' });
  }

  try {
    // Check if JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const cleanPhone = phone.replace('+91', '').replace(/\D/g, '');
    const user = await User.findOne({ phone: cleanPhone });

    if (!user || !user.otpHash || !user.otpCreatedAt) {
      console.error('OTP expired or invalid for phone:', cleanPhone);
      return res.status(400).json({ message: 'OTP expired or invalid' });
    }

    // Check if OTP is expired (5 minutes)
    const isExpired = (Date.now() - user.otpCreatedAt) > 5 * 60 * 1000;
    if (isExpired) {
      user.otpHash = null;
      user.otpCreatedAt = null;
      await user.save();
      console.log('OTP expired for phone:', cleanPhone);
      return res.status(400).json({ message: 'OTP expired' });
    }

    const isValid = await bcrypt.compare(otp, user.otpHash);
    if (isValid) {
      // Clear OTP fields
      user.otpHash = null;
      user.otpCreatedAt = null;
      user.isVerified = true;
      await user.save();

      const token = jwt.sign(
        { phone: cleanPhone, uid: user.uid, authMethod: 'phone' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log('OTP verified successfully for phone:', cleanPhone);
      res.json({ 
        success: true, 
        message: 'OTP verified successfully',
        token: token,
        user: {
          uid: user.uid,
          phone: user.phone,
          name: user.name,
          authMethod: user.authMethod,
        },
      });
    } else {
      console.error('Invalid OTP for phone:', cleanPhone);
      res.status(400).json({ message: 'Invalid OTP' });
    }
  } catch (error) {
    console.error('OTP Verify Error:', {
      message: error.message,
      stack: error.stack,
      phone
    });
    res.status(500).json({ message: 'Server error during OTP verification', error: error.message });
  }
};

// Verify Token
exports.verifyToken = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    console.error('No token provided in verifyToken');
    return res.status(400).json({ valid: false, message: 'Token required' });
  }

  try {
    let user;
    // Try phone-based JWT first
    try {
      console.log('Verifying phone token:', token.slice(0, 10) + '...');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Phone token decoded:', { uid: decoded.uid, phone: decoded.phone });
      user = await User.findOne({ $or: [{ uid: decoded.uid }, { phone: decoded.phone }] });
      if (!user) {
        console.error('User not found for phone token:', decoded.phone);
        return res.status(404).json({ valid: false, message: 'User not found' });
      }
    } catch (jwtError) {
      console.error('Phone token verification failed:', jwtError.message);
      // Try Firebase token
      try {
        console.log('Verifying Firebase token:', token.slice(0, 10) + '...');
        const decoded = await admin.auth().verifyIdToken(token);
        console.log('Firebase token decoded:', { uid: decoded.uid, email: decoded.email });
        user = await User.findOne({ uid: decoded.uid });
        if (!user) {
          console.log('Creating new user for Firebase UID:', decoded.uid);
          user = new User({
            uid: decoded.uid,
            email: decoded.email || undefined, // Avoid null email
            name: decoded.name || decoded.email?.split('@')[0] || 'User',
            authMethod: 'firebase',
            isAdmin: decoded.email === 'myeiokln@gmail.com' ? true : false
          });
          await user.save();
        }
      } catch (firebaseError) {
        console.error('Firebase token verification failed:', firebaseError.message);
        throw new Error('Invalid token');
      }
    }

    if (!user) {
      console.error('User not found for token');
      return res.status(404).json({ valid: false, message: 'User not found' });
    }

    console.log('Token verified, user:', { uid: user.uid, isAdmin: user.isAdmin });
    res.json({
      valid: true,
      user: {
        uid: user.uid,
        phone: user.phone || '',
        email: user.email || '',
        name: user.name || '',
        authMethod: user.authMethod,
        isAdmin: user.isAdmin || false
      }
    });
  } catch (error) {
    console.error('Token verification error:', {
      message: error.message,
      stack: error.stack,
      token: token.slice(0, 10) + '...'
    });
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ valid: false, message: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ valid: false, message: 'Invalid token' });
    }
    res.status(500).json({ valid: false, message: 'Server error during token verification', details: error.message });
  }
};