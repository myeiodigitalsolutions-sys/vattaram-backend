const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');

// Add item to cart
router.post('/', async (req, res) => {
  try {
    const { productId, name, image, category, district, description, subtitle, 
            price, weight, quantity, ratingValue, variantIndex, weightIndex } = req.body;
    
    if (!req.user || !req.user.uid) {
      console.error('Authentication required: No user or UID found', { user: req.user });
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Adding item to cart for user:', req.user.uid, { productId, weight, quantity });

    const existingItem = await Cart.findOne({ 
      userId: req.user.uid, 
      productId,
      weight
    });

    if (existingItem) {
      console.log('Existing item found, updating quantity:', existingItem._id);
      existingItem.quantity += quantity;
      await existingItem.save();
      return res.status(200).json(existingItem);
    }

    const newCartItem = new Cart({
      userId: req.user.uid,
      productId,
      name,
      image,
      category,
      district,
      description,
      subtitle,
      price,
      weight,
      quantity,
      ratingValue,
      variantIndex,
      weightIndex
    });

    console.log('Creating new cart item:', { userId: req.user.uid, productId, weight });
    await newCartItem.save();
    console.log('Cart item saved:', newCartItem._id);
    res.status(201).json(newCartItem);
  } catch (error) {
    console.error('Error adding to cart:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      userId: req.user?.uid
    });
    res.status(500).json({ 
      message: 'Error adding to cart',
      error: error.message 
    });
  }
});

// Get cart items
router.get('/', async (req, res) => {
  try {
    if (!req.user || !req.user.uid) {
      console.error('Authentication required: No user or UID found', { user: req.user });
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Fetching cart items for user:', req.user.uid);
    const cartItems = await Cart.find({ userId: req.user.uid });
    console.log('Cart items fetched:', cartItems.length);
    res.status(200).json(cartItems);
  } catch (error) {
    console.error('Error fetching cart:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.uid
    });
    res.status(500).json({ 
      message: 'Error fetching cart',
      error: error.message 
    });
  }
});

// Update cart item quantity
router.put('/:id', async (req, res) => {
  try {
    if (!req.user || !req.user.uid) {
      console.error('Authentication required: No user or UID found', { user: req.user });
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { quantity } = req.body;
    console.log('Updating cart item quantity:', { id: req.params.id, userId: req.user.uid, quantity });
    const cartItem = await Cart.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.uid },
      { quantity },
      { new: true }
    );

    if (!cartItem) {
      console.error('Cart item not found:', { id: req.params.id, userId: req.user.uid });
      return res.status(404).json({ message: 'Cart item not found' });
    }

    console.log('Cart item updated:', cartItem._id);
    res.status(200).json(cartItem);
  } catch (error) {
    console.error('Error updating cart:', {
      message: error.message,
      stack: error.stack,
      id: req.params.id,
      userId: req.user?.uid
    });
    res.status(500).json({ 
      message: 'Error updating cart',
      error: error.message 
    });
  }
});

// Delete cart item
router.delete('/:id', async (req, res) => {
  try {
    if (!req.user || !req.user.uid) {
      console.error('Authentication required: No user or UID found', { user: req.user });
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Deleting cart item:', { id: req.params.id, userId: req.user.uid });
    const cartItem = await Cart.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.uid 
    });

    if (!cartItem) {
      console.error('Cart item not found:', { id: req.params.id, userId: req.user.uid });
      return res.status(404).json({ message: 'Cart item not found' });
    }

    console.log('Cart item deleted:', cartItem._id);
    res.status(200).json({ message: 'Item removed from cart' });
  } catch (error) {
    console.error('Error removing from cart:', {
      message: error.message,
      stack: error.stack,
      id: req.params.id,
      userId: req.user?.uid
    });
    res.status(500).json({ 
      message: 'Error removing from cart',
      error: error.message 
    });
  }
});

// Clear user's cart
router.delete('/', async (req, res) => {
  try {
    if (!req.user || !req.user.uid) {
      console.error('Authentication required: No user or UID found', { user: req.user });
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log(`Clearing cart for user: ${req.user.uid}`);
    const result = await Cart.deleteMany({ userId: req.user.uid });
    console.log(`Cleared ${result.deletedCount} items from cart`);

    res.status(200).json({ 
      message: 'Cart cleared successfully',
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Error clearing cart:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.uid
    });
    res.status(500).json({ 
      message: 'Error clearing cart',
      error: error.message 
    });
  }
});

module.exports = router;