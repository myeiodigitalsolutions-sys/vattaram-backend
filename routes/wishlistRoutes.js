const express = require('express');
const router = express.Router();
const Wishlist = require('../models/Wishlist');
const verifyAuth = require('../middleware/auth');

router.post('/', verifyAuth, async (req, res) => {
  try {
    const { userId, productId, name, image, category, district, description, 
            subtitle, price, weight, ratingValue, variantIndex, weightIndex } = req.body;

    if (!userId || !productId) {
      return res.status(400).json({ message: 'userId and productId are required' });
    }

    const existingItem = await Wishlist.findOne({ userId, productId });
    if (existingItem) {
      return res.status(200).json(existingItem);
    }

    const newItem = new Wishlist({
      userId,
      productId,
      name: name || 'Unnamed Product',
      image: image || 'https://i.imgur.com/YCa6FJD.jpg',
      category: category || 'General',
      district: district || 'Unknown',
      description: description || '',
      subtitle: subtitle || '',
      price: price || 0,
      weight: weight || '1kg',
      ratingValue: ratingValue || 0,
      variantIndex: variantIndex || 0,
      weightIndex: weightIndex || 0
    });

    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Wishlist error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:userId', verifyAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const items = await Wishlist.find({ userId });
    res.json(items);
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:userId/:productId', verifyAuth, async (req, res) => {
  try {
    const { userId, productId } = req.params;
    if (!userId || !productId) {
      return res.status(400).json({ message: 'userId and productId are required' });
    }

    const result = await Wishlist.findOneAndDelete({ userId, productId });
    if (!result) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json({ message: 'Item removed', deletedId: productId });
  } catch (error) {
    console.error('Error removing item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;