import express from "express";
import Analytics from "../models/Analytics.js";

const router = express.Router();

// GET overall analytics summary
router.get("/summary", async (req, res) => {
  try {
    const summary = await Analytics.find();
    res.status(200).json({ message: "Analytics summary fetched successfully", data: summary });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET monthly analytics
router.get("/monthly", async (req, res) => {
  try {
    const monthly = await Analytics.find({}, "userId monthlyData");
    res.status(200).json({ message: "Monthly analytics fetched successfully", data: monthly });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET analytics by user ID
router.get("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userAnalytics = await Analytics.findOne({ userId: id });
    if (!userAnalytics) {
      return res.status(404).json({ message: "Analytics not found for this user" });
    }
    res.status(200).json({ message: `Analytics for user ${id} fetched successfully`, data: userAnalytics });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST create analytics for a user
router.post("/", async (req, res) => {
  try {
    const { userId } = req.body;
    const existing = await Analytics.findOne({ userId });
    if (existing) {
      return res.status(400).json({ message: "Analytics already exists for this user" });
    }
    const analytics = new Analytics({ userId });
    await analytics.save();
    res.status(201).json({ message: "Analytics created successfully", data: analytics });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// PUT update analytics for a user
router.put("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Analytics.findOneAndUpdate(
      { userId: id },
      { $set: req.body },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Analytics not found for this user" });
    }
    res.status(200).json({ message: "Analytics updated successfully", data: updated });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;