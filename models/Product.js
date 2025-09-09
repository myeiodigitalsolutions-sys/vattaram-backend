const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  weights: [{
    value: {
      type: Number,
      required: true,
      min: [0, 'Weight value must be positive']
    },
    unit: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price must be positive']
    },
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity must be non-negative']
    }
  }]
});

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  images: {
    type: [String],
    required: [true, 'At least one product image is required'],
    validate: {
      validator: function(images) {
        return images && images.length > 0;
      },
      message: 'At least one product image is required'
    }
  },
  subtitle: {
    type: String,
    required: [true, 'Product subtitle is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    trim: true
  },
  district: {
    type: String,
    required: [true, 'Product district is required'],
    trim: true
  },
  ratingValue: {
    type: Number,
    min: [0, 'Rating must be between 0 and 5'],
    max: [5, 'Rating must be between 0 and 5'],
    default: 0
  },
  isTrending: {
    type: Boolean,
    default: false
  },
  trendingOrder: {
    type: Number,
    default: -1
  },
  variants: {
    type: [variantSchema],
    required: [true, 'At least one variant is required'],
    validate: {
      validator: function(variants) {
        return variants && variants.length > 0;
      },
      message: 'At least one variant is required'
    }
  }
}, {
  timestamps: true
});

productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ district: 1 });
productSchema.index({ ratingValue: -1 });
productSchema.index({ isTrending: 1, trendingOrder: 1 });

module.exports = mongoose.model('Product', productSchema);