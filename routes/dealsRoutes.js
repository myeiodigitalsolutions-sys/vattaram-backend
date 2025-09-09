const express = require('express');
const router = express.Router();
const Deal = require('../models/Deal');

// GET active deal
router.get('/active', async (req, res) => {
  try {
    const activeDeal = await Deal.findOne({ 
      active: true,
      endDate: { $gt: new Date() } 
    });
    
    if (!activeDeal) {
      return res.status(404).json({ error: 'No active deal found' });
    }

    res.json(activeDeal);
  } catch (err) {
    console.error('Error fetching active deal:', err);
    res.status(500).json({ error: 'Failed to fetch active deal' });
  }
});

// GET all deals (for admin)
router.get('/', async (req, res) => {
  try {
    const deals = await Deal.find().sort({ createdAt: -1 });
    res.json(deals);
  } catch (err) {
    console.error('Error fetching deals:', err);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET single deal by ID
router.get('/:id', async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);
    
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json(deal);
  } catch (err) {
    console.error('Error fetching deal:', err);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

// POST create new deal
router.post('/', async (req, res) => {
  try {
    const { title, badgeText, discountPercentage, videoId, endDate, items } = req.body;
    
    if (!title || !badgeText || !discountPercentage || !videoId || !endDate || !items || items.length === 0) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.productName || !item.weight || !item.originalPrice || !item.discountedPrice) {
        return res.status(400).json({ 
          error: `Item ${i + 1} is missing required fields` 
        });
      }
    }

    if (req.body.active) {
      await Deal.updateMany({}, { $set: { active: false } });
    }

    const newDeal = new Deal(req.body);
    await newDeal.save();

    res.status(201).json(newDeal);
  } catch (err) {
    console.error('Error creating deal:', err);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: errors.join(', ') });
    }
    
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// PUT update deal
router.put('/:id', async (req, res) => {
  try {
    const dealId = req.params.id;
    if (req.body.active) {
      await Deal.updateMany(
        { _id: { $ne: dealId } }, 
        { $set: { active: false } }
      );
    }

    const updatedDeal = await Deal.findByIdAndUpdate(
      dealId,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedDeal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json(updatedDeal);
  } catch (err) {
    console.error('Error updating deal:', err);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: errors.join(', ') });
    }
    
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

// DELETE deal
router.delete('/:id', async (req, res) => {
  try {
    const deletedDeal = await Deal.findByIdAndDelete(req.params.id);
    
    if (!deletedDeal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json({ 
      message: 'Deal deleted successfully',
      deletedDeal: {
        _id: deletedDeal._id,
        title: deletedDeal.title
      }
    });
  } catch (err) {
    console.error('Error deleting deal:', err);
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

// Toggle deal active status
router.put('/:id/toggle-active', async (req, res) => {
  try {
    const dealId = req.params.id;
    const deal = await Deal.findById(dealId);
    
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    if (!deal.active) {
      await Deal.updateMany(
        { _id: { $ne: dealId } }, 
        { $set: { active: false } }
      );
    }

    deal.active = !deal.active;
    await deal.save();

    res.json(deal);
  } catch (err) {
    console.error('Error toggling deal active status:', err);
    res.status(500).json({ error: 'Failed to toggle deal active status' });
  }
});

// Get deal statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const totalDeals = await Deal.countDocuments();
    const activeDeals = await Deal.countDocuments({ active: true });
    const expiredDeals = await Deal.countDocuments({ endDate: { $lt: new Date() } });
    const upcomingDeals = await Deal.countDocuments({ 
      active: false, 
      endDate: { $gt: new Date() } 
    });

    res.json({
      totalDeals,
      activeDeals,
      expiredDeals,
      upcomingDeals
    });
  } catch (err) {
    console.error('Error fetching deal statistics:', err);
    res.status(500).json({ error: 'Failed to fetch deal statistics' });
  }
});

module.exports = router;