const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const verifyAuth = require('../middleware/auth');
const User = require('../models/User');
const { razorpay } = require('../server'); // Import Razorpay instance
const crypto = require('crypto');

router.get('/', verifyAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      userId,
      all = false,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Admin check for all=true
    const user = await User.findOne({ uid: req.user.uid });
    console.log('Fetching orders for user:', { uid: req.user.uid, isAdmin: user?.isAdmin, authMethod: req.user.authMethod });
    if (all === 'true' && !user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only admin users can view all orders'
      });
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const filter = {};
    
    if (all !== 'true') {
      filter.userId = req.user.uid;
      console.log('Filtering orders by userId:', req.user.uid);
    }
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (userId && all === 'true') {
      filter.userId = userId;
    }
    
    const orders = await Order.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean()
      .populate({
        path: 'userId',
        select: 'name email phone authMethod',
        options: { lean: true }
      });

    console.log('Orders found:', orders.length, { filter });

    // Ensure orders include user details even if population partially fails
    const enrichedOrders = orders.map(order => ({
      ...order,
      userId: order.userId || {
        name: order.name || 'Unknown',
        email: order.email || '',
        phone: order.phone || '',
        authMethod: order.authMethod || 'unknown'
      }
    }));

    const totalOrders = await Order.countDocuments(filter);
    
    res.json({
      success: true,
      orders: enrichedOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders
      }
    });
  } catch (err) {
    console.error('Error fetching orders:', {
      error: err.message,
      stack: err.stack,
      userId: req.user?.uid,
      query: req.query
    });
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch orders',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

router.get('/:id', verifyAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('userId', 'name email phone');
      
    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }
    
    res.json({
      success: true,
      order
    });
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch order details'
    });
  }
});

router.patch('/:id/status', verifyAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'failed']; // CHANGE: Added 'failed'
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid status',
        validStatuses
      });
    }
    
    const updateData = { 
      status,
      updatedAt: new Date() 
    };
    
    if (status === 'shipped') {
      updateData.shippedAt = new Date();
    } 
    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    } 
    if (status === 'cancelled') {
      updateData.cancelledAt = new Date();
    }
    
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }
    
    res.json({
      success: true,
      order
    });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update order status'
    });
  }
});

// CHANGE: New endpoint for payment verification and completion
router.post('/:id/complete-payment', verifyAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.userId !== req.user.uid) {
      return res.status(404).json({ error: 'Order not found or unauthorized' });
    }

    if (order.paymentStatus !== 'pending') {
      return res.status(400).json({ error: 'Payment already processed' });
    }

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (order.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: 'Order ID mismatch' });
    }

    // Verify signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Fetch payment to confirm
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.status !== 'captured') {
      return res.status(400).json({ error: 'Payment not captured' });
    }

    // Update order
    order.paymentId = razorpay_payment_id;
    order.signature = razorpay_signature;
    order.paymentStatus = 'paid';
    order.paymentMethod = payment.method; // 'card', 'upi', etc.
    order.paymentDetails = {
      bank: payment.bank || payment.wallet,
      vpa: payment.vpa,
      cardLast4: payment.card?.last4
    };
    order.status = 'pending'; // Ready for fulfillment

    // Update inventory if not done
    let inventoryUpdates = [];
    if (!order.inventoryUpdated) {
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (product) {
          const variant = product.variants[item.variantIndex];
          if (variant) {
            const weight = variant.weights[item.weightIndex];
            if (weight) {
              if (weight.quantity >= item.quantity) {
                weight.quantity -= item.quantity;
                await product.save();
                inventoryUpdates.push({ productId: item.productId, success: true });
              } else {
                inventoryUpdates.push({ productId: item.productId, success: false, error: 'Insufficient stock' });
              }
            }
          }
        }
      }
      order.inventoryUpdated = true;
    }

    await order.save();

    res.json({
      success: true,
      order,
      inventoryUpdate: {
        successful: inventoryUpdates.filter(u => u.success).length,
        failed: inventoryUpdates.filter(u => !u.success).length,
        details: inventoryUpdates.filter(u => !u.success)
      }
    });
  } catch (err) {
    console.error('Error completing payment:', err);
    res.status(500).json({ error: 'Failed to complete payment', details: err.message });
  }
});

router.post('/', verifyAuth, async (req, res) => {
  try {
    const { 
      paymentMethod, 
      items, 
      shippingAddress, 
      totalAmount, 
      deliveryFee
    } = req.body;

    // Validation checks
    if (!paymentMethod || !items || !shippingAddress || totalAmount === undefined || deliveryFee === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        requiredFields: ['paymentMethod', 'items', 'shippingAddress', 'totalAmount', 'deliveryFee']
      });
    }

    if (!['online', 'cod'].includes(paymentMethod)) { // CHANGE: Updated validation
      return res.status(400).json({ error: 'Invalid payment method', valid: ['online', 'cod'] });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items must be a non-empty array'
      });
    }

    // Item validation
    const itemErrors = [];
    items.forEach((item, index) => {
      if (!item.productId || !item.name || !item.price || !item.quantity || item.variantIndex === undefined || item.weightIndex === undefined) {
        itemErrors.push(`Item ${index + 1} is missing required fields`);
      }
      if (item.price <= 0 || item.quantity <= 0) {
        itemErrors.push(`Item ${index + 1} has invalid price or quantity`);
      }
    });

    if (itemErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid items in order',
        details: itemErrors
      });
    }

    // Address validation
    const addressFields = ['name', 'street', 'district', 'state', 'postalCode', 'phone'];
    const missingAddressFields = addressFields.filter(field => !shippingAddress[field]);

    if (missingAddressFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required shipping address fields',
        missingFields: missingAddressFields
      });
    }

    // Phone validation
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(shippingAddress.phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number (10 digits starting with 6-9)'
      });
    }

    // Postal code validation
    const postalCodeRegex = /^\d{6}$/;
    if (!postalCodeRegex.test(shippingAddress.postalCode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid postal code (6 digits required)'
      });
    }

    // Email validation if provided
    if (shippingAddress.email) {
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(shippingAddress.email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }
    }

    // Price calculation validation
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const calculatedTotal = subtotal + deliveryFee;

    if (Math.abs(totalAmount - calculatedTotal) > 0.01) {
      return res.status(400).json({
        success: false,
        error: 'Total amount mismatch',
        details: {
          calculatedTotal,
          receivedTotal: totalAmount,
          subtotal,
          deliveryFee
        }
      });
    }

    // Check stock availability (no update yet)
    const stockErrors = [];
    const inventoryChecks = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        stockErrors.push(`Product ${item.name} not found`);
        continue;
      }
      const variant = product.variants[item.variantIndex];
      if (!variant) {
        stockErrors.push(`Variant not found for ${item.name}`);
        continue;
      }
      const weight = variant.weights[item.weightIndex];
      if (!weight) {
        stockErrors.push(`Weight not found for ${item.name}`);
        continue;
      }
      if (weight.quantity < item.quantity) {
        stockErrors.push(`Insufficient stock for ${item.name}. Available: ${weight.quantity}, Requested: ${item.quantity}`);
        continue;
      }
      inventoryChecks.push({
        product,
        variantIndex: item.variantIndex,
        weightIndex: item.weightIndex,
        quantityToDecrease: item.quantity
      });
    }

    if (stockErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Stock availability issues',
        details: stockErrors
      });
    }

    // Create DB order
    const order = new Order({
      userId: req.user.uid,
      email: shippingAddress.email || '',
      phone: shippingAddress.phone,
      name: shippingAddress.name,
      address: shippingAddress.street,
      district: shippingAddress.district,
      state: shippingAddress.state,
      zip: shippingAddress.postalCode,
      items: items.map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
        weight: item.weight,
        variantIndex: item.variantIndex,
        weightIndex: item.weightIndex
      })),
      subtotal,
      deliveryFee,
      total: totalAmount,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'cod' : 'pending',
      status: 'pending'
    });

    const validationError = order.validateSync();
    if (validationError) {
      const errors = Object.values(validationError.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors
      });
    }

    await order.save();

    let razorpayOrder = null;
    if (paymentMethod === 'online') {
      // Create Razorpay order
      const razorpayOptions = {
        amount: totalAmount * 100, // in paise
        currency: 'INR',
        receipt: `order_${order._id}`,
        notes: {
          dbOrderId: order._id.toString(),
          userId: req.user.uid,
          customerName: shippingAddress.name
        }
      };

      razorpayOrder = await razorpay.orders.create(razorpayOptions);
      order.razorpayOrderId = razorpayOrder.id;
      await order.save();
    } else if (paymentMethod === 'cod') {
      // For COD, update inventory immediately
      const updateResults = [];
      for (const check of inventoryChecks) {
        const { product, variantIndex, weightIndex, quantityToDecrease } = check;
        product.variants[variantIndex].weights[weightIndex].quantity -= quantityToDecrease;
        await product.save();
        updateResults.push({ productId: product._id, success: true });
      }
      order.inventoryUpdated = true;
      await order.save();
    }

    res.status(201).json({
      success: true,
      order: order.toObject(),
      razorpayOrder, // Null for COD
      message: paymentMethod === 'online' ? 'Order created, proceed to payment' : 'Order placed successfully'
    });
  } catch (err) {
    console.error('Error creating order:', {
      error: err.message,
      stack: err.stack,
      userId: req.user?.uid,
      authMethod: req.user?.authMethod,
      requestBody: req.body
    });
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

router.delete('/delete-all', verifyAuth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only admin users can delete all orders'
      });
    }

    const result = await Order.deleteMany({});
    
    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} orders`
    });
  } catch (err) {
    console.error('Error deleting orders:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete orders',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;