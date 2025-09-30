const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  weight: { type: String },
  image: { type: String }
});

const orderSchema = new Schema({
  userId: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zip: { type: String, required: true },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, required: true },
  total: { type: Number, required: true },
  paymentMethod: { 
    type: String, 
    required: true,
    enum: ['upi', 'card', 'netbanking', 'cod'] // Changed from 'cash' to 'cod'
  },
  paymentDetails: {
    upiId: String,
    cardLast4: String,
    bank: String
  },
  status: { 
    type: String, 
    default: 'pending',
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] 
  },
  orderDate: { type: Date, default: Date.now },
  deliveryDate: Date,
  trackingNumber: String
}, { timestamps: true });

orderSchema.index({ userId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderDate: -1 });

module.exports = mongoose.model('Order', orderSchema);