const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const User = require('../models/User');

exports.verifyToken = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    console.error('No token provided in verifyToken');
    return res.status(400).json({ valid: false, message: 'Token required' });
  }

  try {
    let user;
    // First, try Firebase token
    try {
      console.log('Verifying Firebase token:', token.slice(0, 10) + '...'); // Debug
      const decoded = await admin.auth().verifyIdToken(token);
      console.log('Firebase token decoded:', { uid: decoded.uid, email: decoded.email }); // Debug
      user = await User.findOne({ uid: decoded.uid });
      if (!user) {
        console.log('Creating new user for Firebase UID:', decoded.uid);
        user = new User({
          uid: decoded.uid,
          email: decoded.email || '',
          name: decoded.name || decoded.email?.split('@')[0] || 'User',
          authMethod: 'firebase',
          isAdmin: false
        });
        await user.save();
      }
    } catch (error) {
      console.error('Firebase token verification failed:', error.message);
      // Try phone-based JWT
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Phone token decoded:', { uid: decoded.uid, phone: decoded.phone }); // Debug
        if (decoded.phone) {
          user = await User.findOne({ phone: decoded.phone });
        } else if (decoded.uid) {
          user = await User.findOne({ uid: decoded.uid });
        } else if (decoded.email) {
          user = await User.findOne({ email: decoded.email });
        }
      } catch (jwtError) {
        console.error('Phone token verification failed:', jwtError.message);
        throw new Error('Invalid token');
      }
    }

    if (!user) {
      console.error('User not found for token');
      return res.status(404).json({ valid: false, message: 'User not found' });
    }

    console.log('Token verified, user:', { uid: user.uid, isAdmin: user.isAdmin }); // Debug
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