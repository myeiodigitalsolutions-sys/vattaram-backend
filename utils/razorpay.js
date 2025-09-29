// utils/razorpay.js
const Razorpay = require('razorpay');

let instance = null;

try {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET) {
    console.error('Razorpay credentials missing:', {
      keyIdSet: !!process.env.RAZORPAY_KEY_ID,
      secretSet: !!process.env.RAZORPAY_SECRET,
    });
    throw new Error('Razorpay credentials are missing');
  }
  console.log('Attempting to initialize Razorpay with key:', process.env.RAZORPAY_KEY_ID.substring(0, 5) + '...');
  instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET,
  });
  console.log('Razorpay instance created successfully:', !!instance);
} catch (error) {
  console.error('Failed to initialize Razorpay:', {
    error: error.message,
    stack: error.stack,
    keyIdSet: !!process.env.RAZORPAY_KEY_ID,
    secretSet: !!process.env.RAZORPAY_SECRET,
  });
  instance = null;
}

module.exports = instance;