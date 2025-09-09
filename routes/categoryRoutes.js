const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const multer = require('multer');
const admin = require('../firebaseAdmin');

// Use memory storage for multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

const bucket = admin.storage().bucket();

router.get('/', async (req, res) => {
  try {
    console.log('Fetching categories from MongoDB...');
    const categories = await Category.find();
    console.log('Categories fetched:', categories.length);
    res.json(categories);
  } catch (err) {
    console.error('GET /api/categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories', details: err.message });
  }
});

// POST with file (upload to Firebase Storage)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    let imageUrl = '';

    console.log('POST /api/categories - Name:', name);
    console.log('POST /api/categories - File:', req.file ? req.file.originalname : 'No file');

    if (req.file) {
      const filename = `${Date.now()}-${req.file.originalname}`;
      console.log('Uploading to bucket:', bucket.name);
      const blob = bucket.file(`categories/${filename}`);
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      blobStream.on('error', (err) => {
        console.error('Upload stream error:', err);
        return res.status(500).json({ error: 'Failed to upload image', details: err.message });
      });

      blobStream.on('finish', async () => {
        console.log('Upload finished, making public...');
        await blob.makePublic();
        imageUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        console.log('Image URL:', imageUrl);

        const newCategory = new Category({ name, image: imageUrl });
        await newCategory.save();
        res.status(201).json(newCategory);
      });

      blobStream.end(req.file.buffer);
    } else {
      // If no image, save without (though schema requires it)
      const newCategory = new Category({ name, image: imageUrl });
      await newCategory.save();
      res.status(201).json(newCategory);
    }
  } catch (err) {
    console.error('POST /api/categories error:', err);
    res.status(500).json({ error: 'Failed to add category', details: err.message });
  }
});

// PUT with optional file (upload to Firebase Storage if provided)
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    console.log('PUT /api/categories/:id - ID:', req.params.id, 'Name:', name);
    console.log('PUT /api/categories/:id - File:', req.file ? req.file.originalname : 'No file');

    const existingCategory = await Category.findById(req.params.id);
    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    let imageUrl = existingCategory.image;

    if (req.file) {
      const filename = `${Date.now()}-${req.file.originalname}`;
      console.log('Uploading to bucket:', bucket.name);
      const blob = bucket.file(`categories/${filename}`);
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      blobStream.on('error', (err) => {
        console.error('Upload stream error:', err);
        return res.status(500).json({ error: 'Failed to upload image', details: err.message });
      });

      blobStream.on('finish', async () => {
        console.log('Upload finished, making public...');
        await blob.makePublic();
        imageUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        console.log('Image URL:', imageUrl);

        const updatedCategory = await Category.findByIdAndUpdate(
          req.params.id,
          { name, image: imageUrl },
          { new: true }
        );
        res.json(updatedCategory);
      });

      blobStream.end(req.file.buffer);
    } else {
      const updatedCategory = await Category.findByIdAndUpdate(
        req.params.id,
        { name, image: imageUrl },
        { new: true }
      );
      res.json(updatedCategory);
    }
  } catch (err) {
    console.error('PUT /api/categories/:id error:', err);
    res.status(400).json({ error: 'Failed to update category', details: err.message });
  }
});

// DELETE all categories
router.delete('/', async (req, res) => {
  try {
    console.log('DELETE /api/categories - Deleting all categories');
    const categories = await Category.find();
    
    // Delete all images from Firebase Storage
    for (const category of categories) {
      if (category.image) {
        try {
          const imagePath = category.image.split(`${bucket.name}/`)[1];
          if (imagePath) {
            console.log(`Deleting image from Firebase: ${imagePath}`);
            await bucket.file(imagePath).delete();
          }
        } catch (err) {
          console.warn(`Failed to delete image for category ${category._id}:`, err.message);
          // Continue with deletion even if image deletion fails
        }
      }
    }

    // Delete all categories from MongoDB
    await Category.deleteMany({});
    res.json({ message: 'All categories and their images deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/categories error:', err);
    res.status(500).json({ error: 'Failed to delete categories', details: err.message });
  }
});

// DELETE a category by ID
router.delete('/:id', async (req, res) => {
  try {
    console.log('DELETE /api/categories/:id - ID:', req.params.id);
    const deletedCategory = await Category.findByIdAndDelete(req.params.id);
    if (!deletedCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Delete image from Firebase Storage if it exists
    if (deletedCategory.image) {
      try {
        const imagePath = deletedCategory.image.split(`${bucket.name}/`)[1];
        if (imagePath) {
          console.log(`Deleting image from Firebase: ${imagePath}`);
          await bucket.file(imagePath).delete();
        }
      } catch (err) {
        console.warn(`Failed to delete image for category ${req.params.id}:`, err.message);
        // Continue with response even if image deletion fails
      }
    }

    res.json({ message: 'Category and its image deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/categories/:id error:', err);
    res.status(500).json({ error: 'Failed to delete category', details: err.message });
  }
});

module.exports = router;