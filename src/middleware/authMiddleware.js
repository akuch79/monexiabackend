import jwt from "jsonwebtoken";
import User from "../models/User.js"; // ✅ Fix 1: added .js extension for ESM compatibility

export const authMiddleware = async (req, res, next) => {
  // ✅ Fix 2: Guard against missing JWT_SECRET in environment
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not defined in environment variables");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const authHeader = req.headers.authorization;

  // ✅ Fix 3: Validate header format (must be "Bearer <token>")
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Fix 4: Explicitly exclude password even if model default changes
    const user = await User.findById(decoded.id).select("-password -__v");

    // ✅ Fix 5: Handle case where user was deleted after token was issued
    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    req.user = user;
    next();
  } catch (err) {
    // ✅ Fix 6: Distinguish between expired and invalid tokens
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token has expired, please log in again" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Unexpected errors
    console.error("Auth middleware error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
};