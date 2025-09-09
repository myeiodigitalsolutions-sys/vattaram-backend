const mongoose = require('mongoose');

const aboutUsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String, required: true },
  description: { type: String, required: true },
  connectionToSouth: {
    title: { type: String, required: true },
    description: { type: String, required: true },
    items: [{
      name: { type: String, required: true },
      description: { type: String, required: true }
    }]
  },
  commitment: {
    title: { type: String, required: true },
    description: [{ type: String, required: true }]
  },
  images: [{
    src: { type: String, required: true },
    alt: { type: String, required: true },
    caption: { type: String, required: true }
  }]
});

module.exports = mongoose.model('AboutUs', aboutUsSchema);