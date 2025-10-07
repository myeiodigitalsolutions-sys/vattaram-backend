const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const multer = require('multer');
const admin = require('../firebaseAdmin');
const mongoose = require('mongoose');

// Use memory storage for multer to handle files in memory
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit per file
});

// Initialize Firebase Storage bucket
const bucket = admin.storage().bucket('vattaram-63357.firebasestorage.app');
// GET all products with variants flattened and full image URLs
router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    const flattenedProducts = products.flatMap(product => 
      product.variants.flatMap((variant, variantIndex) =>
        variant.weights.map((weight, weightIndex) => ({
          _id: product._id,
          variantIndex: variantIndex,
          weightIndex: weightIndex,
          name: product.name,
          image: product.images[0] || '', // Use first image
          imageUrl: product.images[0] || '', // For frontend consistency
          images: product.images, // Include all images
          subtitle: product.subtitle,
          description: product.description,
          category: product.category,
          district: product.district,
          ratingValue: product.ratingValue,
          weight: weight,
          weightQuantity: weight.quantity,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          isTrending: product.isTrending,
          trendingOrder: product.trendingOrder
        }))
      )
    );
    res.json(flattenedProducts);
  } catch (err) {
    console.error('❌ Error fetching products:', err.message);
    res.status(500).json({ error: 'Failed to fetch products', details: err.message });
  }
});

// GET trending products
router.get('/trending', async (req, res) => {
  try {
    const products = await Product.find({ isTrending: true }).sort({ trendingOrder: 1 });
    const updatedProducts = products.map(product => ({
      ...product.toObject(),
      imageUrl: product.images[0] || '', // Use first image
      images: product.images // Include all images
    }));
    res.json(updatedProducts);
  } catch (err) {
    console.error('❌ Error fetching trending products:', err.message);
    res.status(500).json({ error: 'Failed to fetch trending products', details: err.message });
  }
});

// PUT add/remove from trending
router.put('/:id/trending', async (req, res) => {
  try {
    const { isTrending } = req.body;
    
    if (isTrending) {
      const count = await Product.countDocuments({ isTrending: true });
      await Product.findByIdAndUpdate(req.params.id, { 
        isTrending: true,
        trendingOrder: count
      });
    } else {
      await Product.findByIdAndUpdate(req.params.id, { 
        isTrending: false,
        trendingOrder: -1
      });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error updating trending status:', err.message);
    res.status(400).json({ error: 'Failed to update trending status', details: err.message });
  }
});

// PUT update trending order
router.put('/:id/trending-order', async (req, res) => {
  try {
    const { direction } = req.body;
    const product = await Product.findById(req.params.id);
    
    if (!product || !product.isTrending) {
      return res.status(400).json({ error: 'Product not found or not trending' });
    }

    const currentOrder = product.trendingOrder;
    let swapProduct;

    if (direction === 'up' && currentOrder > 0) {
      swapProduct = await Product.findOne({ 
        isTrending: true, 
        trendingOrder: currentOrder - 1 
      });
      
      if (swapProduct) {
        await Product.updateMany({
          _id: { $in: [product._id, swapProduct._id] }
        }, [{
          $set: {
            trendingOrder: {
              $cond: [
                { $eq: ['$_id', product._id] },
                currentOrder - 1,
                currentOrder + 1
              ]
            }
          }
        }]);
      }
    } else if (direction === 'down') {
      swapProduct = await Product.findOne({ 
        isTrending: true, 
        trendingOrder: currentOrder + 1 
      });
      
      if (swapProduct) {
        await Product.updateMany({
          _id: { $in: [product._id, swapProduct._id] }
        }, [{
          $set: {
            trendingOrder: {
              $cond: [
                { $eq: ['$_id', product._id] },
                currentOrder + 1,
                currentOrder - 1
              ]
            }
          }
        }]);
      }
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error updating trending order:', err.message);
    res.status(400).json({ error: 'Failed to update trending order', details: err.message });
  }
});

// POST add new product with multiple image uploads to Firebase
router.post('/', upload.array('images', 10), async (req, res) => {
  try {
    const { name, subtitle, description, category, district, ratingValue, variants } = req.body;
    const imageUrls = [];

    console.log('POST /api/products - Name:', name);
    console.log('POST /api/products - Files:', req.files ? req.files.map(f => f.originalname) : 'No files');

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    // Verify bucket existence
    try {
      await bucket.getMetadata();
      console.log('Bucket exists:', bucket.name);
    } catch (err) {
      console.error('Bucket verification error:', err);
      return res.status(500).json({ error: 'Storage bucket not found or inaccessible', details: err.message });
    }

    // Upload images
    const uploadPromises = req.files.map(async (file) => {
      const filename = `${Date.now()}-${file.originalname}`;
      console.log('Uploading to bucket:', bucket.name);
      const blob = bucket.file(`products/${filename}`);
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: file.mimetype,
        },
      });

      return new Promise((resolve, reject) => {
        blobStream.on('error', (err) => {
          console.error('Upload stream error:', err);
          reject(err);
        });

        blobStream.on('finish', async () => {
          console.log('Upload finished, making public...');
          await blob.makePublic();
          const url = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
          console.log('Image URL:', url);
          resolve(url);
        });

        blobStream.end(file.buffer);
      });
    });

    try {
      const uploadedUrls = await Promise.all(uploadPromises);
      imageUrls.push(...uploadedUrls);

      const parsedVariants = JSON.parse(variants);
      const newProduct = new Product({
        name,
        subtitle,
        description,
        category,
        district,
        ratingValue: parseFloat(ratingValue) || 0,
        images: imageUrls,
        variants: parsedVariants
      });

      await newProduct.save();
      res.status(201).json(newProduct);
    } catch (err) {
      console.error('Image upload error:', err);
      return res.status(500).json({ error: 'Failed to upload images', details: err.message });
    }
  } catch (err) {
    console.error('POST /api/products error:', err);
    res.status(500).json({ error: 'Failed to add product', details: err.message });
  }
});
// PUT update product with optional multiple image uploads to Firebase
router.put('/:id', upload.array('images', 10), async (req, res) => {
  try {
    const { name, subtitle, description, category, district, ratingValue, variants, existingImages } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let imageUrls = JSON.parse(existingImages || '[]'); // Kept images

    console.log('PUT /api/products/:id - ID:', req.params.id, 'Name:', name);
    console.log('PUT /api/products/:id - Files:', req.files ? req.files.map(f => f.originalname) : 'No files');
    console.log('PUT /api/products/:id - Existing images:', imageUrls.length);

    // Delete removed images
    const removedImages = product.images.filter(url => !imageUrls.includes(url));
    if (removedImages.length > 0) {
      try {
        const deletePromises = removedImages.map(async (imageUrl) => {
          const imagePath = imageUrl.split(`${bucket.name}/`)[1];
          if (imagePath) {
            console.log(`Deleting image from Firebase: ${imagePath}`);
            await bucket.file(imagePath).delete();
          }
        });
        await Promise.all(deletePromises);
      } catch (err) {
        console.warn(`Failed to delete some images for product ${req.params.id}:`, err.message);
      }
    }

    // Upload new images if any
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(async (file) => {
        const filename = `${Date.now()}-${file.originalname}`;
        console.log('Uploading to bucket:', bucket.name);
        const blob = bucket.file(`products/${filename}`);
        const blobStream = blob.createWriteStream({
          metadata: {
            contentType: file.mimetype,
          },
        });

        return new Promise((resolve, reject) => {
          blobStream.on('error', (err) => {
            console.error('Upload stream error:', err);
            reject(err);
          });

          blobStream.on('finish', async () => {
            console.log('Upload finished, making public...');
            await blob.makePublic();
            const url = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            console.log('Image URL:', url);
            resolve(url);
          });

          blobStream.end(file.buffer);
        });
      });

      try {
        const uploadedUrls = await Promise.all(uploadPromises);
        imageUrls = [...imageUrls, ...uploadedUrls];
      } catch (err) {
        console.error('Image upload error:', err);
        return res.status(500).json({ error: 'Failed to upload images', details: err.message });
      }
    }

    // Update product
    product.name = name || product.name;
    product.subtitle = subtitle || product.subtitle;
    product.description = description || product.description;
    product.category = category || product.category;
    product.district = district || product.district;
    product.ratingValue = parseFloat(ratingValue) || product.ratingValue;
    product.images = imageUrls;
    product.variants = JSON.parse(variants) || product.variants;

    await product.save();
    res.json(product);
  } catch (err) {
    console.error('PUT /api/products/:id error:', err);
    res.status(400).json({ error: 'Failed to update product', details: err.message });
  }
});

// DELETE a product by ID
router.delete('/:id', async (req, res) => {
  try {
    console.log('DELETE /api/products/:id - ID:', req.params.id);
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Delete all images from Firebase Storage
    if (deletedProduct.images && deletedProduct.images.length > 0) {
      try {
        const deletePromises = deletedProduct.images.map(async (imageUrl) => {
          const imagePath = imageUrl.split(`${bucket.name}/`)[1];
          if (imagePath) {
            console.log(`Deleting image from Firebase: ${imagePath}`);
            await bucket.file(imagePath).delete();
          }
        });
        await Promise.all(deletePromises);
      } catch (err) {
        console.warn(`Failed to delete some images for product ${req.params.id}:`, err.message);
      }
    }

    res.json({ message: 'Product and its images deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/products/:id error:', err);
    res.status(500).json({ error: 'Failed to delete product', details: err.message });
  }
});

// GET specific variant/weight with full image URLs
router.get('/:id/:variantIndex/:weightIndex', async (req, res) => {
  try {
    const { id, variantIndex, weightIndex } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const variant = product.variants[parseInt(variantIndex)];
    if (!variant) return res.status(404).json({ error: 'Variant not found' });

    const weight = variant.weights[parseInt(weightIndex)];
    if (!weight) return res.status(404).json({ error: 'Weight not found' });

    const result = {
      _id: product._id,
      name: product.name,
      image: product.images[0] || '', // Use first image
      imageUrl: product.images[0] || '', // For consistency
      images: product.images, // Include all images
      subtitle: product.subtitle,
      description: product.description,
      category: product.category,
      district: product.district,
      ratingValue: product.ratingValue,
      weight: weight,
      weightQuantity: weight.quantity,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };

    res.json(result);
  } catch (err) {
    console.error('❌ Error getting variant/weight:', err.message);
    res.status(500).json({ error: 'Failed to get variant/weight', details: err.message });
  }
});

// PUT update specific weight quantity
router.put('/:id/:variantIndex/:weightIndex/quantity', async (req, res) => {
  const { id, variantIndex, weightIndex } = req.params;
  const { quantity } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  if (!Number.isFinite(quantity) || quantity < 0) {
    return res.status(400).json({ error: 'Quantity must be a non-negative number' });
  }

  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const variant = product.variants[parseInt(variantIndex)];
    if (!variant) return res.status(404).json({ error: 'Variant not found at index' });

    const weight = variant.weights[parseInt(weightIndex)];
    if (!weight) return res.status(404).json({ error: 'Weight option not found at index' });

    weight.quantity = parseInt(quantity);
    await product.save();

    res.json({ 
      message: 'Weight quantity updated successfully',
      updatedQuantity: weight.quantity
    });
  } catch (err) {
    console.error('❌ Error updating weight quantity:', err.message);
    res.status(500).json({ error: 'Failed to update weight quantity', details: err.message });
  }
});

// DELETE specific variant of a product
router.delete('/:id/:variantIndex', async (req, res) => {
  const { id, variantIndex } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const indexToRemove = parseInt(variantIndex);
    if (indexToRemove < 0 || indexToRemove >= product.variants.length) {
      return res.status(404).json({ error: 'Variant index out of range' });
    }

    product.variants.splice(indexToRemove, 1);
    await product.save();

    res.json({ message: `Variant at index ${indexToRemove} deleted successfully` });
  } catch (err) {
    console.error('❌ Error deleting variant:', err.message);
    res.status(500).json({ error: 'Failed to delete variant', details: err.message });
  }
});

// DELETE specific weight option from a variant
router.delete('/:id/:variantIndex/:weightIndex', async (req, res) => {
  const { id, variantIndex, weightIndex } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const variant = product.variants[parseInt(variantIndex)];
    if (!variant) return res.status(404).json({ error: 'Variant not found at index' });

    const weightIndexToRemove = parseInt(weightIndex);
    if (weightIndexToRemove < 0 || weightIndexToRemove >= variant.weights.length) {
      return res.status(404).json({ error: 'Weight index out of range' });
    }

    if (variant.weights.length === 1) {
      return res.status(400).json({ error: 'Cannot delete the last weight option. Delete the entire variant instead.' });
    }

    variant.weights.splice(weightIndexToRemove, 1);
    await product.save();

    res.json({ message: `Weight option at index ${weightIndexToRemove} deleted successfully` });
  } catch (err) {
    console.error('❌ Error deleting weight option:', err.message);
    res.status(500).json({ error: 'Failed to delete weight option', details: err.message });
  }
});

module.exports = router;