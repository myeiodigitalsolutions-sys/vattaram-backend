const express = require("express");
const router = express.Router();
const admin = require("../firebaseAdmin"); // Firebase Admin SDK
const User = require("../models/User"); // MongoDB User model

// Get all verified users (Firebase email-verified or MongoDB phone-verified)
router.get("/users", async (req, res) => {
  try {
    // Fetch Firebase users
    const listAllUsers = async (nextPageToken, users = []) => {
      const result = await admin.auth().listUsers(1000, nextPageToken);
      users.push(...result.users);
      if (result.pageToken) {
        return await listAllUsers(result.pageToken, users);
      }
      return users;
    };

    // Get Firebase users (email-verified)
    const firebaseUsers = await listAllUsers();
    const firebaseFiltered = firebaseUsers
      .filter((user) => user.email && user.emailVerified)
      .map((user) => ({
        uid: user.uid,
        email: user.email,
        name: user.displayName || "",
        phone: user.phoneNumber || "",
        provider: user.providerData.map((p) => p.providerId).join(", "),
        authMethod: "email",
      }));

    // Get MongoDB users (phone-verified)
    const mongoUsers = await User.find({ isVerified: true }).lean();
    const mongoFiltered = mongoUsers.map((user) => ({
      uid: user.uid,
      email: "",
      name: user.name || user.phone,
      phone: user.phone,
      provider: "phone",
      authMethod: "phone",
    }));

    // Combine and remove duplicates (if a user exists in both Firebase and MongoDB)
    const allUsers = [...firebaseFiltered, ...mongoFiltered];
    const uniqueUsers = Array.from(
      new Map(allUsers.map((user) => [user.uid, user])).values()
    );

    res.json(uniqueUsers);
  } catch (err) {
    console.error("Error listing users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get user profile by UID
router.get("/users/:uid", async (req, res) => {
  const { uid } = req.params;
  try {
    // Try to find user in Firebase
    let user;
    try {
      const firebaseUser = await admin.auth().getUser(uid);
      if (firebaseUser.email && firebaseUser.emailVerified) {
        user = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || "",
          phone: firebaseUser.phoneNumber || "",
          provider: firebaseUser.providerData.map((p) => p.providerId).join(", "),
          authMethod: "email",
        };
      }
    } catch (error) {
      // Firebase user not found, try MongoDB
      if (error.code === "auth/user-not-found") {
        const mongoUser = await User.findOne({ uid, isVerified: true }).lean();
        if (mongoUser) {
          user = {
            uid: mongoUser.uid,
            email: "",
            name: mongoUser.name || mongoUser.phone,
            phone: mongoUser.phone,
            provider: "phone",
            authMethod: "phone",
          };
        }
      } else {
        throw error; // Re-throw other Firebase errors
      }
    }

    if (!user) {
      return res.status(404).json({ error: "User not found or not verified" });
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user profile:", err);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

// Delete a user by UID
router.delete("/users/:uid", async (req, res) => {
  const { uid } = req.params;
  try {
    // Try to delete from Firebase
    let firebaseDeleted = false;
    try {
      await admin.auth().deleteUser(uid);
      firebaseDeleted = true;
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        throw error; // Re-throw if it's not a "user not found" error
      }
    }

    // Try to delete from MongoDB
    const mongoDeleteResult = await User.deleteOne({ uid });
    const mongoDeleted = mongoDeleteResult.deletedCount > 0;

    if (!firebaseDeleted && !mongoDeleted) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

module.exports = router;