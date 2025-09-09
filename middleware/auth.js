const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const User = require("../models/User");

const verifyAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("No token provided:", { authHeader, path: req.path });
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    console.log("Verifying token:", { token: token.slice(0, 10) + "...", path: req.path });

    let user;
    // Try Firebase token first
    try {
      const firebaseDecoded = await admin.auth().verifyIdToken(token);
      console.log("Firebase token verified:", { uid: firebaseDecoded.uid });
      user = await User.findOne({ uid: firebaseDecoded.uid });
      if (!user) {
        console.log("Creating new user for Firebase UID:", firebaseDecoded.uid);
        user = new User({
          uid: firebaseDecoded.uid,
          email: firebaseDecoded.email || "",
          name: firebaseDecoded.name || firebaseDecoded.email?.split("@")[0] || "User",
          authMethod: "firebase",
          isAdmin: firebaseDecoded.email === "pcsoldiers0@gmail.com" ? true : false,
        });
        await user.save();
      }
      req.user = {
        uid: user.uid,
        authMethod: "firebase",
        email: firebaseDecoded.email || "",
        phone: firebaseDecoded.phone_number || "",
        isAdmin: user.isAdmin || false,
      };
    } catch (firebaseError) {
      console.error("Firebase token verification failed:", firebaseError.message);
      // Try phone-based JWT
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("Phone token decoded:", { uid: decoded.uid, phone: decoded.phone });
        user = await User.findOne({ $or: [{ uid: decoded.uid }, { phone: decoded.phone }] });
        if (!user) {
          console.log("Creating new user for phone:", decoded.phone);
          user = new User({
            uid: `phone-${decoded.phone}`,
            phone: decoded.phone,
            name: decoded.name || "User",
            authMethod: "phone",
            isVerified: true,
            isAdmin: false,
          });
          await user.save();
        }
        req.user = {
          uid: user.uid,
          authMethod: "phone",
          phone: user.phone || decoded.phone || "",
          email: user.email || "",
          isAdmin: user.isAdmin || false,
        };
      } catch (jwtError) {
        console.error("Phone token verification failed:", jwtError.message);
        if (jwtError.name === "TokenExpiredError") {
          return res.status(401).json({ error: "Unauthorized: Token expired" });
        }
        return res.status(401).json({ error: "Unauthorized: Invalid token", details: jwtError.message });
      }
    }

    // Check admin privileges for /admin routes
    if (req.path.startsWith("/admin") && !req.user.isAdmin) {
      console.error("Access denied: Admin privileges required", { uid: req.user.uid });
      return res.status(403).json({ error: "Access denied: Admin privileges required" });
    }

    console.log("User authenticated:", {
      uid: req.user.uid,
      authMethod: req.user.authMethod,
      isAdmin: req.user.isAdmin,
    });
    next();
  } catch (error) {
    console.error("Token verification error:", {
      message: error.message,
      stack: error.stack,
      path: req.path,
    });
    return res.status(401).json({ error: "Unauthorized: Invalid token", details: error.message });
  }
};

module.exports = verifyAuth;