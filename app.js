// Add this to your backend server.js/app.js
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Your authentication logic here
    // This is just an example - replace with your actual logic
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Check password (assuming you have bcrypt)
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Generate token (assuming you have jwt)
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1d' }
    );
    
    res.json({ 
      token, 
      message: 'Login successful',
      user: { id: user._id, email: user.email }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});