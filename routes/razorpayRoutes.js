const express = require('express');
const router = express.Router();
const { razorpay } = require('../server');
const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');

router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    const options = {
      amount: Math.round(amount * 100),
      currency,
      receipt: receipt || `order_${Date.now()}`,
      notes: notes || {},
      payment_capture: 1
    };

    const order = await razorpay.orders.create(options);
    
    res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ success: false, error: 'Failed to create order', details: error.message });
  }
});

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
    res.status(500).json({ success: false, error: 'Failed to fetch payment details', details: error.message });
  }
});

router.post('/refund', async (req, res) => {
  try {
    const { paymentId, amount, notes } = req.body;

    if (!paymentId) {
      return res.status(400).json({ success: false, error: 'Payment ID is required' });
    }

    const refundOptions = {
      amount: amount ? Math.round(amount * 100) : null,
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
    res.status(500).json({ success: false, error: 'Failed to process refund', details: error.message });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    const payload = JSON.stringify(req.body);

    const generatedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    if (generatedSignature !== signature) {
      return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    if (event === 'payment.captured') {
      const { payment_id, order_id } = req.body.payload.payment.entity;
      const order = await Order.findOne({ razorpayOrderId: order_id });

      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      if (order.paymentStatus !== 'pending') {
        return res.status(400).json({ success: false, error: 'Payment already processed' });
      }

      const payment = await razorpay.payments.fetch(payment_id);
      if (payment.status !== 'captured') {
        return res.status(400).json({ success: false, error: 'Payment not captured' });
      }

      order.paymentId = payment_id;
      order.signature = signature;
      order.paymentStatus = 'paid';
      order.paymentMethod = payment.method;
      order.paymentDetails = {
        bank: payment.bank || payment.wallet,
        vpa: payment.vpa,
        cardLast4: payment.card?.last4
      };
      order.status = 'pending';

      if (!order.inventoryUpdated) {
        for (const item of order.items) {
          const product = await Product.findById(item.productId);
          if (product) {
            const variant = product.variants[item.variantIndex];
            if (variant) {
              const weight = variant.weights[item.weightIndex];
              if (weight && weight.quantity >= item.quantity) {
                weight.quantity -= item.quantity;
                await product.save();
              } else {
                throw new Error(`Insufficient stock for ${item.name}`);
              }
            }
          }
        }
        order.inventoryUpdated = true;
      }

      await order.save();
      res.json({ success: true, message: 'Webhook processed' });
    } else if (event === 'payment.failed') {
      const { order_id } = req.body.payload.payment.entity;
      const order = await Order.findOne({ razorpayOrderId: order_id });
      if (order) {
        order.status = 'failed';
        order.paymentStatus = 'failed';
        await order.save();
      }
      res.json({ success: true, message: 'Payment failure recorded' });
    } else {
      res.json({ success: true, message: 'Event ignored' });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed', details: error.message });
  }
});

module.exports = router;