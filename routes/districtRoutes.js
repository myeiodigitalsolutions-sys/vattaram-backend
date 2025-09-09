const express = require('express');
const router = express.Router();
const District = require('../models/District');
const multer = require('multer');
const admin = require('../firebaseAdmin'); // Import Firebase Admin

// Use memory storage for multer to handle file in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Initialize Firebase Storage bucket (default bucket for the project)
const bucket = admin.storage().bucket();

// GET all districts
router.get('/', async (req, res) => {
  try {
    const districts = await District.find();
    res.json(districts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch districts' });
  }
});

// GET a single district by ID
router.get('/:id', async (req, res) => {
  try {
    const district = await District.findById(req.params.id);
    if (!district) {
      return res.status(404).json({ error: 'District not found' });
    }
    res.json(district);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch district' });
  }
});

// POST with file (upload to Firebase Storage)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    let imageUrl = '';

    if (req.file) {
      // Create a unique filename
      const filename = `${Date.now()}-${req.file.originalname}`;
      const blob = bucket.file(`districts/${filename}`);
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      // Handle stream errors
      blobStream.on('error', (err) => {
        console.error('Upload error:', err);
        return res.status(500).json({ error: 'Failed to upload image' });
      });

      // On finish, make public and get URL
      blobStream.on('finish', async () => {
        await blob.makePublic();
        imageUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

        // Save to MongoDB
        const newDistrict = new District({ name, image: imageUrl });
        await newDistrict.save();
        res.status(201).json(newDistrict);
      });

      blobStream.end(req.file.buffer);
    } else {
      // If no image, save without (though required, handle as per schema)
      const newDistrict = new District({ name, image: imageUrl });
      await newDistrict.save();
      res.status(201).json(newDistrict);
    }
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Failed to add district' });
  }
});

// PUT with optional file (upload to Firebase Storage if provided)
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;

    // Fetch current district data first
    const existingDistrict = await District.findById(req.params.id);
    if (!existingDistrict) {
      return res.status(404).json({ error: 'District not found' });
    }

    let imageUrl = existingDistrict.image; // Keep existing by default

    if (req.file) {
      // Create a unique filename
      const filename = `${Date.now()}-${req.file.originalname}`;
      const blob = bucket.file(`districts/${filename}`);
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      // Handle stream errors
      blobStream.on('error', (err) => {
        console.error('Upload error:', err);
        return res.status(500).json({ error: 'Failed to upload image' });
      });

      // On finish, make public and get URL
      blobStream.on('finish', async () => {
        await blob.makePublic();
        imageUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

        // Update MongoDB
        const updatedDistrict = await District.findByIdAndUpdate(
          req.params.id,
          { name, image: imageUrl },
          { new: true }
        );
        res.json(updatedDistrict);
      });

      blobStream.end(req.file.buffer);
    } else {
      // No new image, just update name
      const updatedDistrict = await District.findByIdAndUpdate(
        req.params.id,
        { name, image: imageUrl },
        { new: true }
      );
      res.json(updatedDistrict);
    }
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Failed to update district' });
  }
});

// DELETE a district by ID
router.delete('/:id', async (req, res) => {
  try {
    console.log('DELETE /api/districts/:id - ID:', req.params.id);
    const deletedDistrict = await District.findByIdAndDelete(req.params.id);
    if (!deletedDistrict) {
      return res.status(404).json({ error: 'District not found' });
    }

    // Delete image from Firebase Storage if it exists
    if (deletedDistrict.image) {
      try {
        const imagePath = deletedDistrict.image.split(`${bucket.name}/`)[1];
        if (imagePath) {
          console.log(`Deleting image from Firebase: ${imagePath}`);
          await bucket.file(imagePath).delete();
        }
      } catch (err) {
        console.warn(`Failed to delete image for district ${req.params.id}:`, err.message);
        // Continue with response even if image deletion fails
      }
    }

    res.json({ message: 'District and its image deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/districts/:id error:', err);
    res.status(500).json({ error: 'Failed to delete district', details: err.message });
  }
});

module.exports = router;