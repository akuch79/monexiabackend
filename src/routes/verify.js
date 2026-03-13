app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    // In a full app, you would generate a JWT Token here
    res.json({ 
      success: true, 
      user: { id: user._id, name: user.fullName, email: user.email } 
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});