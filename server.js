require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const admin = require('./firebaseAdmin');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // ✅ moved up before usage
const Razorpay = require("razorpay");

// Import Routes
const districtRoutes = require('./routes/districtRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/ProductRoutes');
const testimonial = require('./routes/testimonialRoutes');
const aboutus = require('./routes/aboutUsRoutes');
const deals = require('./routes/dealsRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const verifyAuth = require('./middleware/auth');
const { sendOTP, verifyOTP, verifyToken } = require('./controllers/otpController');

// Import Models
const User = require('./models/User');
const ContactMessage = require('./models/ContactMessage');
require('./models/Cart'); // ✅ load globally
require('./models/ContactMessage');

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------------------- MongoDB Connection ---------------------- */
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB connected successfully');

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed due to app termination');
      process.exit(0);
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};
connectDB();

/* ---------------------- Middleware ---------------------- */
app.use(cors({
  origin: (origin, callback) => {
    console.log('Request Origin:', origin);
    const allowedOrigins = [
      'http://localhost:3000',
      'https://vattaram-8cn5.vercel.app',
       'https://vattaram.shop',
       'https://vattaram-backend-5.onrender.com',


    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// ✅ Removed duplicate bodyParser.json()

/* ---------------------- Contact Routes ---------------------- */
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const contactMessage = new ContactMessage({ name, email, message });
    await contactMessage.save();
    res.status(201).json({ message: 'Message sent successfully', id: contactMessage._id });
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.get('/api/contact', verifyAuth, async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ timestamp: -1 });
    res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/* ---------------------- OTP Routes ---------------------- */
app.post('/api/send-otp', sendOTP);
app.post('/api/verify-otp', verifyOTP);
app.post('/api/verify-token', verifyToken);

/* ---------------------- Other Routes ---------------------- */
app.use('/api/districts', districtRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/testimonials', testimonial);
app.use('/api/about-us', aboutus);
app.use('/api/deals', deals);
app.use('/api/cart', verifyAuth, cartRoutes);
app.use('/api/orders', verifyAuth, orderRoutes);
app.use('/api/users', require('./routes/users'));
app.use('/api/wishlist', wishlistRoutes);
app.use('/admin', require('./routes/admin'));

/* ---------------------- Health Check ---------------------- */
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({ 
    status: 'OK', 
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

/* ---------------------- Razorpay Setup ---------------------- */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Webhook Route
app.post("/api/payment/webhook", (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const shasum = crypto.createHmac("sha256", secret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest("hex");

  if (digest === req.headers["x-razorpay-signature"]) {
    console.log("Webhook verified:", req.body);
    // TODO: process payment event (update DB, notify user, etc.)
    res.status(200).json({ status: "ok" });
  } else {
    console.log("Invalid signature");
    res.status(400).send("Invalid signature");
  }
});

// ✅ Create Order
app.post("/api/payment/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    const options = {
      amount: amount * 100, // convert to paise
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };
    const order = await razorpay.orders.create(options);
    res.json({ success: true, orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Verify Payment
app.post("/api/payment/verify", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    // TODO: update DB with payment success
    res.json({ success: true, message: "Payment verified successfully" });
  } else {
    res.status(400).json({ success: false, error: "Invalid signature" });
  }
});

/* ---------------------- Base Routes ---------------------- */
app.get('/', (req, res) => {
  res.send('South Bay Mart API Running...');
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

/* ---------------------- Start Server ---------------------- */
mongoose.connection.once('open', () => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('Models available:', Object.keys(mongoose.models));
  });
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
  if (process.env.NODE_ENV === 'production') {
    console.log('Exiting process due to MongoDB connection failure');
    process.exit(1);
  }
});
