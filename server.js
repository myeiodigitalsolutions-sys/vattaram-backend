require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const admin = require('./firebaseAdmin');
const jwt = require('jsonwebtoken');

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
const User = require('./models/User');
const ContactMessage = require('./models/ContactMessage');

const app = express();
const PORT = process.env.PORT || 5000;

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
    console.log('Loading Mongoose models...');
    require('./models/Cart');
    console.log('Cart model loaded');
    require('./models/ContactMessage');
    console.log('ContactMessage model loaded');

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

app.use(cors({
  origin: (origin, callback) => {
    console.log('Request Origin:', origin);
    const allowedOrigins = [
      'http://localhost:3000',
      'https://vattaram-8cn5.vercel.app',
     
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
app.use(bodyParser.json());
// Removed: app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// Contact Message Routes
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

app.post('/api/send-otp', sendOTP);
app.post('/api/verify-otp', verifyOTP);
app.post('/api/verify-token', verifyToken);

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

app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({ 
    status: 'OK', 
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.send('South Bay Mart API Running...');
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

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