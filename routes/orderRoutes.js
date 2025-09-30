const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const verifyAuth = require('../middleware/auth');
const User = require('../models/User');

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
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled']; 
    
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

router.post('/', verifyAuth, async (req, res) => {
  try {
    const { 
      paymentMethod, 
      items, 
      shippingAddress, 
      totalAmount, 
      deliveryFee,
      paymentDetails = {} 
    } = req.body;

    // Validation checks
    if (!paymentMethod || !items || !shippingAddress || totalAmount === undefined || deliveryFee === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        requiredFields: ['paymentMethod', 'items', 'shippingAddress', 'totalAmount', 'deliveryFee']
      });
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
      if (!item.productId || !item.name || !item.price || !item.quantity) {
        itemErrors.push(`Item ${index + 1} is missing required fields`);
      }
      if (item.price <= 0 || item.quantity <= 0) {
        itemErrors.push(`Item ${index + 1} has invalid price or quantity`);
      }
      if (item.variantIndex === undefined || item.weightIndex === undefined) {
        itemErrors.push(`Item ${index + 1} is missing variantIndex or weightIndex`);
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

    // Validate phone number
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(shippingAddress.phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number (10 digits starting with 6-9)'
      });
    }

    // Validate postal code
    const postalCodeRegex = /^\d{6}$/;
    if (!postalCodeRegex.test(shippingAddress.postalCode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid postal code (6 digits required)'
      });
    }

    // Email validation only if provided
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

    // Payment method validation
    const paymentMethods = {
      card: { 
        required: ['cardLast4'], 
        validate: (details) => /^\d{4}$/.test(details.cardLast4)
      },
      upi: { 
        required: ['upiId'], 
        validate: (details) => /.+@.+/i.test(details.upiId)
      },
      netbanking: { 
        required: ['bank'], 
        validate: (details) => typeof details.bank === 'string' && details.bank.trim().length > 0
      },
      cod: { required: [], validate: () => true }
    };

    if (!paymentMethods[paymentMethod]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method',
        validMethods: Object.keys(paymentMethods)
      });
    }

    const method = paymentMethods[paymentMethod];
    const missingPaymentFields = method.required.filter(field => !paymentDetails[field]);

    if (missingPaymentFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment fields',
        missingFields: missingPaymentFields
      });
    }

    if (!method.validate(paymentDetails)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment details',
        details: `Validation failed for ${paymentMethod} payment method`
      });
    }

    // Check product availability and update quantities
    const inventoryUpdates = [];
    const stockErrors = [];

    for (const item of items) {
      try {
        const product = await Product.findById(item.productId);
        if (!product) {
          stockErrors.push(`Product ${item.name} not found`);
          continue;
        }

        const variant = product.variants[item.variantIndex];
        if (!variant) {
          stockErrors.push(`Variant not found for product ${item.name}`);
          continue;
        }

        const weight = variant.weights[item.weightIndex];
        if (!weight) {
          stockErrors.push(`Weight option not found for product ${item.name}`);
          continue;
        }

        if (weight.quantity < item.quantity) {
          stockErrors.push(`Insufficient stock for ${item.name}. Available: ${weight.quantity}, Requested: ${item.quantity}`);
          continue;
        }

        inventoryUpdates.push({
          product,
          variantIndex: item.variantIndex,
          weightIndex: item.weightIndex,
          quantityToDecrease: item.quantity,
          currentQuantity: weight.quantity
        });
      } catch (error) {
        console.error(`Error checking inventory for product ${item.productId}:`, error);
        stockErrors.push(`Error checking inventory for ${item.name}`);
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
      paymentDetails: paymentMethod === 'cod' ? {} : paymentDetails,
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

    const updatePromises = inventoryUpdates.map(async (update) => {
      try {
        const { product, variantIndex, weightIndex, quantityToDecrease } = update;
        product.variants[variantIndex].weights[weightIndex].quantity -= quantityToDecrease;
        await product.save();
        console.log(`✅ Updated inventory for product ${product.name}: decreased by ${quantityToDecrease}`);
        return {
          productId: product._id,
          productName: product.name,
          success: true,
          newQuantity: product.variants[variantIndex].weights[weightIndex].quantity
        };
      } catch (error) {
        console.error(`❌ Error updating inventory for product ${update.product._id}:`, error);
        return {
          productId: update.product._id,
          productName: update.product.name,
          success: false,
          error: error.message
        };
      }
    });

    const updateResults = await Promise.allSettled(updatePromises);
    const successfulUpdates = [];
    const failedUpdates = [];

    updateResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          successfulUpdates.push(result.value);
        } else {
          failedUpdates.push(result.value);
        }
      } else {
        failedUpdates.push({
          productId: inventoryUpdates[index].product._id,
          productName: inventoryUpdates[index].product.name,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    if (successfulUpdates.length > 0) {
      console.log(`✅ Successfully updated inventory for ${successfulUpdates.length} products`);
    }

    if (failedUpdates.length > 0) {
      console.error(`❌ Failed to update inventory for ${failedUpdates.length} products:`, failedUpdates);
    }

    res.status(201).json({
      success: true,
      order: order.toObject(),
      message: 'Order created successfully',
      inventoryUpdate: {
        successful: successfulUpdates.length,
        failed: failedUpdates.length,
        details: failedUpdates.length > 0 ? { failedUpdates } : undefined
      }
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