const mongoose = require('mongoose');

const districtSchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, required: true },
 
});

module.exports = mongoose.model('District', districtSchema);
