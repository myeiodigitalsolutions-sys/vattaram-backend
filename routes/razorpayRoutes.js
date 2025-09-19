const express = require('express');
const { razorpay } = require('../server'); // Import from server.js
const router = express.Router();

// Create Razorpay Order (kept for reference, but now handled in order routes)
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