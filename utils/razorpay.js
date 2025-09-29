// utils/razorpay.js (New file - add this to your project)
const Razorpay = require('razorpay');

let instance = null;

try {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET) {
    throw new Error('Razorpay credentials are missing');
  }
  instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET,
  });
  console.log('Razorpay instance created successfully');
} catch (error) {
  console.error('Failed to initialize Razorpay:', {
    error: error.message,
    stack: error.stack
  });
  instance = null;
}

module.exports = instance;