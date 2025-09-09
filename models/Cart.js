const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  productId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  district: {
    type: String,
    required: true
  },
  description: String,
  subtitle: String,
  price: {
    type: Number,
    required: true
  },
  weight: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  ratingValue: Number,
  variantIndex: Number,
  weightIndex: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure unique product and weight per user
cartItemSchema.index({ userId: 1, productId: 1, weight: 1 }, { unique: true }, (err) => {
  if (err) {
    console.error('Error creating cart index:', err.message);
  } else {
    console.log('Cart compound index created successfully');
  }
});

// Export the model, reusing it if already defined
module.exports = mongoose.models.Cart || mongoose.model('Cart', cartItemSchema);