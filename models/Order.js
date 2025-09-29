const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  weight: { type: String },
  image: { type: String },
  variantIndex: { type: Number, required: true }, // CHANGE: Made required for inventory update
  weightIndex: { type: Number, required: true }   // CHANGE: Made required
});

const orderSchema = new Schema({
  userId: { type: String, required: true },
  email: { type: String },
  phone: { type: String, required: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  district: { type: String, required: true }, // CHANGE: Renamed from city for consistency
  state: { type: String, required: true },
  zip: { type: String, required: true },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, required: true },
  total: { type: Number, required: true },
  paymentMethod: { 
    type: String, 
    required: true,
    enum: ['online', 'cod'] // CHANGE: Simplified enums
  },
  paymentDetails: { type: Schema.Types.Mixed, default: {} }, // CHANGE: Flexible for Razorpay details
  razorpayOrderId: { type: String }, // CHANGE: New for Razorpay link
  paymentId: { type: String },       // CHANGE: New
  signature: { type: String },       // CHANGE: New
  status: { 
    type: String, 
    default: 'pending',
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'failed'] // CHANGE: Added 'failed'
  },
  paymentStatus: {                   // CHANGE: New for tracking payment
    type: String,
    default: 'pending',
    enum: ['pending', 'paid', 'failed', 'refunded', 'cod']
  },
  inventoryUpdated: { type: Boolean, default: false }, // CHANGE: New for idempotent updates
  orderDate: { type: Date, default: Date.now },
  shippedAt: Date,                   // CHANGE: Renamed from deliveryDate, added more timestamps
  deliveredAt: Date,
  cancelledAt: Date,
  trackingNumber: String
}, { timestamps: true });

orderSchema.index({ userId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 }); // CHANGE: New index
orderSchema.index({ razorpayOrderId: 1 }); // CHANGE: New for webhook lookup
orderSchema.index({ orderDate: -1 });

module.exports = mongoose.model('Order', orderSchema);