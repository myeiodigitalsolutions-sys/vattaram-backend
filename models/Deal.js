const mongoose = require('mongoose');

const dealItemSchema = new mongoose.Schema({
  productName: { 
    type: String, 
    required: true,
    trim: true
  },
  weight: { 
    type: String, 
    required: true,
    trim: true
  },
  originalPrice: { 
    type: Number, 
    required: true,
    min: 0
  },
  discountedPrice: { 
    type: Number, 
    required: true,
    min: 0
  },
  image: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  }
});

const dealSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  badgeText: { 
    type: String, 
    required: true,
    trim: true
  },
  discountPercentage: { 
    type: Number, 
    required: true,
    min: 1,
    max: 99
  },
  videoId: { 
    type: String, 
    required: true,
    trim: true
  },
  endDate: { 
    type: Date, 
    required: true,
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'End date must be in the future'
    }
  },
  active: { 
    type: Boolean, 
    default: false 
  },
  items: {
    type: [dealItemSchema],
    validate: {
      validator: function(items) {
        return items && items.length > 0;
      },
      message: 'Deal must have at least one item'
    }
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});
dealSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});
dealSchema.pre('save', async function(next) {
  if (this.active && this.isNew) {
    await mongoose.model('Deal').updateMany(
      { _id: { $ne: this._id } }, 
      { $set: { active: false } }
    );
  }
  next();
});
dealSchema.virtual('totalItems').get(function() {
  return this.items ? this.items.length : 0;
});
dealSchema.virtual('isExpired').get(function() {
  return new Date() > this.endDate;
});
dealSchema.set('toJSON', { virtuals: true });
dealSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Deal', dealSchema);