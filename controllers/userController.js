// controllers/userController.js
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Helper: generate JWT
const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "30d" });

// Helper: generate 6-digit custom ID
const generateCustomId = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
export const registerUser = async (req, res) => {
  try {
    const { name, email, password, phoneNumber } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phoneNumber: phoneNumber || "",
      customId: generateCustomId(),
      role: "user",
    });

    const token = generateToken(user._id, user.role);

    res.status(201).json({
      success: true,
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        customId: user.customId,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
};

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user._id, user.role);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        customId: user.customId,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        customId: user.customId,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.name        = req.body.name        || user.name;
    user.phoneNumber = req.body.phoneNumber || user.phoneNumber;

    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      user.password  = await bcrypt.hash(req.body.password, salt);
    }

    const updated = await user.save();

    res.json({
      success: true,
      message: "Profile updated",
      user: {
        id: updated._id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        customId: updated.customId,
        phoneNumber: updated.phoneNumber,
      },
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

// @desc    Get all users
// @route   GET /api/users/all
// @access  Private (admin)
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("name email customId phoneNumber role createdAt")
      .limit(100);

    res.json({ success: true, count: users.length, users });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// @desc    Get user by customId
// @route   GET /api/users/:customId
// @access  Private
export const getUserByCustomId = async (req, res) => {
  try {
    const user = await User.findOne({ customId: req.params.customId })
      .select("name email customId phoneNumber");

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ success: true, user });
  } catch (error) {
    console.error("Find user error:", error);
    res.status(500).json({ error: "Failed to find user" });
  }
};