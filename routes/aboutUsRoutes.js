const express = require('express');
const router = express.Router();
const AboutUs = require('../models/AboutUs');
router.get('/', async (req, res) => {
  try {
    const aboutUs = await AboutUs.findOne();
    if (!aboutUs) {
      return res.status(404).json({ message: 'About Us content not found' });
    }   
    res.json(aboutUs);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching About Us content', error: err.message });
  }
});

// Create or replace About Us content
router.post('/', async (req, res) => {
  try {
    await AboutUs.deleteMany({});
    const aboutUs = new AboutUs(req.body);
    await aboutUs.save();
    res.status(201).json(aboutUs);
  } catch (err) {
    res.status(400).json({ message: 'Error creating About Us content', error: err.message });
  }
});

// Update About Us content
router.put('/', async (req, res) => {
  try {
    const aboutUs = await AboutUs.findOneAndUpdate({}, req.body, {
      new: true,
      upsert: true,
      runValidators: true
    });
    res.json(aboutUs);
  } catch (err) {
    res.status(400).json({ message: 'Error updating About Us content', error: err.message });
  }
});

module.exports = router;