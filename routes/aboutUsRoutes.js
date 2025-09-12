const express = require('express');
const router = express.Router();
const multer = require('multer');
const admin = require('firebase-admin');
const AboutUs = require('../models/AboutUs');

// Initialize Firebase Admin if not already done
let bucket;
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'), // Adjust path to your service account key
   storageBucket: "vattaram-63357.firebasestorage.app"// Replace with your Firebase Storage bucket URL
  });
}


bucket = admin.storage().bucket();

const upload = multer({ storage: multer.memoryStorage() });

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

// Create or replace About Us content (now using upsert logic for consistency)
router.post('/', upload.any(), async (req, res) => {
  try {
    const data = JSON.parse(req.body.data);
    
    // Process uploaded images
    const imageFiles = {};
    if (req.files) {
      req.files.forEach(file => {
        const match = file.fieldname.match(/\[(\d+)\]/);
        if (match) {
          imageFiles[parseInt(match[1])] = file;
        }
      });
    }
    
    data.images = data.images.map((img, idx) => {
      const file = imageFiles[idx];
      if (file) {
        return new Promise((resolve, reject) => {
          const fileName = `about-us/${Date.now()}-${file.originalname}`;
          const bucketFile = bucket.file(fileName);
          
          const stream = bucketFile.createWriteStream({
            metadata: {
              contentType: file.mimetype,
            },
          });
          
          stream.on('error', reject);
          stream.on('finish', async () => {
            try {
              await bucketFile.makePublic();
              const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
              resolve({ ...img, src: publicUrl });
            } catch (err) {
              reject(err);
            }
          });
          
          stream.end(file.buffer);
        });
      } else {
        return img;
      }
    });
    
    // Wait for all image uploads
    data.images = await Promise.all(data.images);
    
    const aboutUs = await AboutUs.findOneAndUpdate({}, data, {
      new: true,
      upsert: true,
      runValidators: true
    });
    
    res.status(201).json(aboutUs);
  } catch (err) {
    res.status(400).json({ message: 'Error creating About Us content', error: err.message });
  }
});

// Update About Us content
router.put('/', upload.any(), async (req, res) => {
  try {
    const data = JSON.parse(req.body.data);
    
    // Process uploaded images
    const imageFiles = {};
    if (req.files) {
      req.files.forEach(file => {
        const match = file.fieldname.match(/\[(\d+)\]/);
        if (match) {
          imageFiles[parseInt(match[1])] = file;
        }
      });
    }
    
    data.images = data.images.map((img, idx) => {
      const file = imageFiles[idx];
      if (file) {
        return new Promise((resolve, reject) => {
          const fileName = `about-us/${Date.now()}-${file.originalname}`;
          const bucketFile = bucket.file(fileName);
          
          const stream = bucketFile.createWriteStream({
            metadata: {
              contentType: file.mimetype,
            },
          });
          
          stream.on('error', reject);
          stream.on('finish', async () => {
            try {
              await bucketFile.makePublic();
              const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
              resolve({ ...img, src: publicUrl });
            } catch (err) {
              reject(err);
            }
          });
          
          stream.end(file.buffer);
        });
      } else {
        return img;
      }
    });
    
    // Wait for all image uploads
    data.images = await Promise.all(data.images);
    
    const aboutUs = await AboutUs.findOneAndUpdate({}, data, {
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