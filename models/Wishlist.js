const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
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
  description: {
    type: String,
    required: true
  },
  subtitle: {
    type: String
  },
  price: {
    type: Number,
    required: true
  },
  weight: {
    type: String,
    required: true
  },
  ratingValue: {
    type: Number
  },
  variantIndex: {
    type: Number
  },
  weightIndex: {
    type: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Wishlist', wishlistItemSchema);