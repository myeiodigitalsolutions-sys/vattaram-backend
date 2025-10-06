const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const verifyAuth = require('../middleware/auth');
const User = require('../models/User');
const razorpay = require('../utils/razorpay');
const crypto = require('crypto');

// Temporary order storage (in-memory for simplicity; use a database in production)
const temporaryOrders = new Map();

router.get('/', verifyAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      userId,
      paymentStatus,
      all = false,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const user = await User.findOne({ uid: req.user.uid });
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
    }
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (userId && all === 'true') {
      filter.userId = userId;
    }
    // Default to excluding pending payment orders unless explicitly requested
    if (!paymentStatus || paymentStatus === 'completed') {
      filter.paymentStatus = { $in: ['paid', 'cod'] };
    } else if (paymentStatus === 'pending') {
      filter.paymentStatus = 'pending';
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
      userId: req.user?.uid
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
    
    if (order.userId.toString() !== req.user.uid && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to view this order'
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
    const user = await User.findOne({ uid: req.user.uid });
    if (!user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only admin users can update order status'
      });
    }

    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'failed'];
    
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

router.post('/temp', verifyAuth, async (req, res) => {
  try {
    const { paymentMethod, items, shippingAddress, totalAmount, deliveryFee } = req.body;

    if (!paymentMethod || !items || !shippingAddress || totalAmount === undefined || deliveryFee === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        requiredFields: ['paymentMethod', 'items', 'shippingAddress', 'totalAmount', 'deliveryFee']
      });
    }

    if (paymentMethod !== 'online') {
      return res.status(400).json({ 
        success: false, 
        error: 'Temporary orders are only for online payments' 
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Items must be a non-empty array' 
      });
    }

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

    const addressFields = ['name', 'street', 'district', 'state', 'postalCode', 'phone'];
    const missingAddressFields = addressFields.filter(field => !shippingAddress[field]);
    if (missingAddressFields.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required shipping address fields', 
        missingFields: missingAddressFields 
      });
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(shippingAddress.phone)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid phone number (10 digits starting with 6-9)' 
      });
    }

    const postalCodeRegex = /^\d{6}$/;
    if (!postalCodeRegex.test(shippingAddress.postalCode)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid postal code (6 digits required)' 
      });
    }

    if (shippingAddress.email && !/^\S+@\S+\.\S+$/.test(shippingAddress.email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email format' 
      });
    }

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const calculatedTotal = subtotal + deliveryFee;

    if (Math.abs(totalAmount - calculatedTotal) > 0.01) {
      return res.status(400).json({
        success: false,
        error: 'Total amount mismatch',
        details: { calculatedTotal, receivedTotal: totalAmount, subtotal, deliveryFee }
      });
    }

    const stockErrors = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        stockErrors.push(`Product ${item.name} not found (ID: ${item.productId})`);
        continue;
      }
      const variant = product.variants[item.variantIndex];
      if (!variant) {
        stockErrors.push(`Variant not found for ${item.name} (Variant Index: ${item.variantIndex})`);
        continue;
      }
      const weight = variant.weights[item.weightIndex];
      if (!weight) {
        stockErrors.push(`Weight not found for ${item.name} (Weight Index: ${item.weightIndex})`);
        continue;
      }
      if (weight.quantity < item.quantity) {
        stockErrors.push(`Insufficient stock for ${item.name}. Available: ${weight.quantity}, Requested: ${item.quantity}`);
        continue;
      }
    }

    if (stockErrors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Stock availability issues', 
        details: stockErrors 
      });
    }

    const tempOrderId = crypto.randomBytes(16).toString('hex');
    const tempOrder = {
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
      paymentMethod: 'online',
      paymentStatus: 'pending',
      status: 'pending',
      createdAt: new Date()
    };

    let razorpayOrder = null;
    try {
      if (!razorpay) {
        console.error('Razorpay instance not initialized:', {
          keyIdSet: !!process.env.RAZORPAY_KEY_ID,
          secretSet: !!process.env.RAZORPAY_SECRET,
        });
        throw new Error('Razorpay service unavailable');
      }
      const razorpayOptions = {
        amount: Math.round(totalAmount * 100),
        currency: 'INR',
        receipt: `temp_order_${tempOrderId}`,
        notes: {
          tempOrderId,
          userId: req.user.uid,
          customerName: shippingAddress.name
        },
        payment_capture: 1
      };
      razorpayOrder = await razorpay.orders.create(razorpayOptions);
      console.log('Razorpay order created:', razorpayOrder.id);
    } catch (razorpayError) {
      console.error('Razorpay order creation failed:', {
        error: razorpayError.message,
        stack: razorpayError.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to create Razorpay order',
        details: razorpayError.message
      });
    }

    temporaryOrders.set(tempOrderId, tempOrder);

    res.status(201).json({
      success: true,
      tempOrderId,
      razorpayOrder,
      message: 'Temporary order created, proceed to payment'
    });
  } catch (err) {
    console.error('Error creating temporary order:', {
      error: err.message,
      stack: err.stack,
      userId: req.user?.uid
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create temporary order',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

router.post('/confirm', verifyAuth, async (req, res) => {
  try {
    const { tempOrderId, razorpayResponse } = req.body;

    if (!tempOrderId || !razorpayResponse) {
      return res.status(400).json({
        success: false,
        error: 'Missing tempOrderId or razorpayResponse'
      });
    }

    const tempOrder = temporaryOrders.get(tempOrderId);
    if (!tempOrder) {
      return res.status(404).json({
        success: false,
        error: 'Temporary order not found'
      });
    }

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = razorpayResponse;

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      temporaryOrders.delete(tempOrderId);
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.status !== 'captured') {
      temporaryOrders.delete(tempOrderId);
      return res.status(400).json({ success: false, error: 'Payment not captured' });
    }

    const order = new Order({
      ...tempOrder,
      paymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      signature: razorpay_signature,
      paymentStatus: 'paid',
      paymentMethod: payment.method,
      paymentDetails: {
        bank: payment.bank || payment.wallet,
        vpa: payment.vpa,
        cardLast4: payment.card?.last4
      },
      inventoryUpdated: false
    });

    const updateResults = [];
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        updateResults.push({ productId: item.productId, success: false, error: `Product ${item.name} not found` });
        continue;
      }
      const variant = product.variants[item.variantIndex];
      if (!variant) {
        updateResults.push({ productId: item.productId, success: false, error: `Variant not found for ${item.name}` });
        continue;
      }
      const weight = variant.weights[item.weightIndex];
      if (!weight) {
        updateResults.push({ productId: item.productId, success: false, error: `Weight not found for ${item.name}` });
        continue;
      }
      if (weight.quantity < item.quantity) {
        updateResults.push({ productId: item.productId, success: false, error: `Insufficient stock for ${item.name}` });
        continue;
      }
      weight.quantity -= item.quantity;
      await product.save();
      updateResults.push({ productId: item.productId, success: true });
    }

    if (updateResults.some(result => !result.success)) {
      temporaryOrders.delete(tempOrderId);
      return res.status(400).json({
        success: false,
        error: 'Failed to update inventory',
        details: updateResults.filter(r => !r.success)
      });
    }

    order.inventoryUpdated = true;
    await order.save();
    temporaryOrders.delete(tempOrderId);

    res.json({
      success: true,
      order,
      message: 'Order confirmed successfully'
    });
  } catch (err) {
    console.error('Error confirming order:', {
      error: err.message,
      stack: err.stack,
      userId: req.user?.uid
    });
    res.status(500).json({
      success: false,
      error: 'Failed to confirm order',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

router.post('/cancel', verifyAuth, async (req, res) => {
  try {
    const { tempOrderId } = req.body;
    if (!tempOrderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing tempOrderId'
      });
    }

    if (!temporaryOrders.has(tempOrderId)) {
      return res.status(404).json({
        success: false,
        error: 'Temporary order not found'
      });
    }

    temporaryOrders.delete(tempOrderId);
    res.json({
      success: true,
      message: 'Temporary order cancelled successfully'
    });
  } catch (err) {
    console.error('Error cancelling temporary order:', {
      error: err.message,
      stack: err.stack,
      userId: req.user?.uid
    });
    res.status(500).json({
      success: false,
      error: 'Failed to cancel temporary order',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

router.post('/', verifyAuth, async (req, res) => {
  try {
    const { paymentMethod, items, shippingAddress, totalAmount, deliveryFee } = req.body;

    console.log('Order creation request:', { paymentMethod, items, shippingAddress, totalAmount, deliveryFee });

    if (!paymentMethod || !items || !shippingAddress || totalAmount === undefined || deliveryFee === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        requiredFields: ['paymentMethod', 'items', 'shippingAddress', 'totalAmount', 'deliveryFee']
      });
    }

    if (!['cod'].includes(paymentMethod)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Use /api/orders/temp for online payments' 
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Items must be a non-empty array' 
      });
    }

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

    const addressFields = ['name', 'street', 'district', 'state', 'postalCode', 'phone'];
    const missingAddressFields = addressFields.filter(field => !shippingAddress[field]);
    if (missingAddressFields.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required shipping address fields', 
        missingFields: missingAddressFields 
      });
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(shippingAddress.phone)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid phone number (10 digits starting with 6-9)' 
      });
    }

    const postalCodeRegex = /^\d{6}$/;
    if (!postalCodeRegex.test(shippingAddress.postalCode)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid postal code (6 digits required)' 
      });
    }

    if (shippingAddress.email && !/^\S+@\S+\.\S+$/.test(shippingAddress.email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email format' 
      });
    }

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const calculatedTotal = subtotal + deliveryFee;

    if (Math.abs(totalAmount - calculatedTotal) > 0.01) {
      return res.status(400).json({
        success: false,
        error: 'Total amount mismatch',
        details: { calculatedTotal, receivedTotal: totalAmount, subtotal, deliveryFee }
      });
    }

    const stockErrors = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        stockErrors.push(`Product ${item.name} not found (ID: ${item.productId})`);
        continue;
      }
      const variant = product.variants[item.variantIndex];
      if (!variant) {
        stockErrors.push(`Variant not found for ${item.name} (Variant Index: ${item.variantIndex})`);
        continue;
      }
      const weight = variant.weights[item.weightIndex];
      if (!weight) {
        stockErrors.push(`Weight not found for ${item.name} (Weight Index: ${item.weightIndex})`);
        continue;
      }
      if (weight.quantity < item.quantity) {
        stockErrors.push(`Insufficient stock for ${item.name}. Available: ${weight.quantity}, Requested: ${item.quantity}`);
        continue;
      }
    }

    if (stockErrors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Stock availability issues', 
        details: stockErrors 
      });
    }

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
      paymentStatus: 'cod',
      status: 'pending',
      inventoryUpdated: false
    });

    const validationError = order.validateSync();
    if (validationError) {
      console.error('Order validation failed:', validationError);
      return res.status(400).json({
        success: false,
        error: 'Order validation error',
        details: Object.values(validationError.errors).map(e => e.message)
      });
    }

    const updateResults = [];
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        updateResults.push({ productId: item.productId, success: false, error: `Product ${item.name} not found` });
        continue;
      }
      const variant = product.variants[item.variantIndex];
      if (!variant) {
        updateResults.push({ productId: item.productId, success: false, error: `Variant not found for ${item.name}` });
        continue;
      }
      const weight = variant.weights[item.weightIndex];
      if (!weight) {
        updateResults.push({ productId: item.productId, success: false, error: `Weight not found for ${item.name}` });
        continue;
      }
      if (weight.quantity < item.quantity) {
        updateResults.push({ productId: item.productId, success: false, error: `Insufficient stock for ${item.name}` });
        continue;
      }
      weight.quantity -= item.quantity;
      await product.save();
      updateResults.push({ productId: item.productId, success: true });
    }

    if (updateResults.some(result => !result.success)) {
      return res.status(400).json({
        success: false,
        error: 'Failed to update inventory',
        details: updateResults.filter(r => !r.success)
      });
    }

    order.inventoryUpdated = true;
    await order.save();

    res.status(201).json({
      success: true,
      order: order.toObject(),
      message: 'Order placed successfully'
    });
  } catch (err) {
    console.error('Error creating order:', {
      error: err.message,
      stack: err.stack,
      userId: req.user?.uid,
      requestBody: req.body
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

router.delete('/delete-all', verifyAuth, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user.isAdmin) {
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