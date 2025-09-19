const express = require('express');
const { razorpay } = require('../server'); // Import from server.js
const QRCode = require('qrcode');
const crypto = require('crypto');
const router = express.Router();

// Create Razorpay Order
router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const options = {
      amount: amount, // Amount in paise
      currency: currency,
      receipt: receipt || `order_${Date.now()}`,
      notes: notes || {},
      payment_capture: 1 // Auto capture payment
    };

    const order = await razorpay.orders.create(options);
    
    console.log('Razorpay order created:', order.id);
    
    res.status(200).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create order' 
    });
  }
});

// Generate UPI QR Code
router.post('/generate-upi-qr', async (req, res) => {
  try {
    const { orderId, amount, customer } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Order ID and amount are required' });
    }

    // Create UPI deep link
    const upiUrl = `upi://pay?pa=your-merchant-vpa@razorpay&pn=SouthBayMart&am=${amount}&cu=INR&tn=Order%20${orderId}`;

    // Generate QR code
    const qrCodeDataUrl = await QRCode.toDataURL(upiUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // You can also store this in your database for tracking
    const qrData = {
      orderId,
      amount,
      customer: customer || {},
      qrImage: qrCodeDataUrl,
      upiUrl,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes expiry
    };

    console.log('UPI QR generated for order:', orderId);

    res.status(200).json({
      success: true,
      qrData: qrData,
      message: 'QR Code generated successfully'
    });

  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate QR code' 
    });
  }
});

// Verify Payment
router.post('/verify-payment', async (req, res) => {
  try {
    const { paymentId, orderId, razorpaySignature } = req.body;

    if (!paymentId || !orderId) {
      return res.status(400).json({ error: 'Payment ID and Order ID are required' });
    }

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(paymentId);
    const order = await razorpay.orders.fetch(orderId);

    // Verify payment
    if (payment.status === 'captured' && 
        payment.order_id === orderId && 
        payment.amount === order.amount) {
      
      // Verify signature if provided
      if (razorpaySignature) {
        const generatedSignature = crypto
          .createHmac('sha256', process.env.RAZORPAY_SECRET)
          .update(paymentId + '|' + orderId)
          .digest('hex');

        if (generatedSignature !== razorpaySignature) {
          return res.status(400).json({ error: 'Invalid payment signature' });
        }
      }

      res.status(200).json({
        success: true,
        payment: {
          id: payment.id,
          amount: payment.amount / 100,
          status: payment.status,
          method: payment.method,
          bank: payment.acquirer_data?.bank || 'Unknown'
        },
        order: {
          id: order.id,
          amount: order.amount / 100,
          status: order.status
        },
        message: 'Payment verified successfully'
      });

    } else {
      res.status(400).json({ 
        error: 'Payment verification failed', 
        details: { paymentStatus: payment.status, orderStatus: order.status }
      });
    }

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to verify payment' 
    });
  }
});

// Get payment details
router.get('/payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await razorpay.payments.fetch(paymentId);
    
    res.status(200).json({
      success: true,
      payment: {
        id: payment.id,
        amount: payment.amount / 100,
        status: payment.status,
        method: payment.method,
        captured: payment.captured,
        bank: payment.acquirer_data?.bank || 'Unknown',
        email: payment.email,
        contact: payment.contact
      }
    });

  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch payment details' 
    });
  }
});

// Refund payment (if needed)
router.post('/refund', async (req, res) => {
  try {
    const { paymentId, amount, notes } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: 'Payment ID is required' });
    }

    const refundOptions = {
      amount: amount ? amount * 100 : null, // Full refund if amount not specified
      notes: notes || { reason: 'Customer requested refund' }
    };

    const refund = await razorpay.payments.refund(paymentId, refundOptions);

    res.status(200).json({
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        created_at: refund.created_at
      },
      message: 'Refund processed successfully'
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to process refund' 
    });
  }
});

module.exports = router;