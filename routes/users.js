const express = require("express");
const router = express.Router();
const User = require("../models/User");

router.post("/verify-phone", async (req, res) => {
  const { uid, phone } = req.body;

  try {
    let user = await User.findOne({ uid });
    if (!user) {
      user = new User({ uid, phone });
      await user.save();
    }
    res.status(200).json({ message: "User saved", user });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Example route
router.get('/profile', async (req, res) => {
  const users = await User.find();
  res.json(users);
});

module.exports = router;
