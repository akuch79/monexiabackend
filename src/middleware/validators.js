// ✅ User registration validator
export const validateRegister = (req, res, next) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || firstName.trim().length < 2) {
    return res.status(400).json({ message: "First name must be at least 2 characters" });
  }

  if (!lastName || lastName.trim().length < 2) {
    return res.status(400).json({ message: "Last name must be at least 2 characters" });
  }

  if (!email || !email.includes("@")) {
    return res.status(400).json({ message: "Valid email is required" });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  next();
};

// ✅ User login validator
export const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  next();
};

// ✅ Account creation validator
export const validateAccount = (req, res, next) => {
  const { name, balance } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ message: "Account name is required" });
  }

  if (balance == null || isNaN(balance)) {
    return res.status(400).json({ message: "Valid balance is required" });
  }

  next();
};

// ✅ Budget creation validator
export const validateBudget = (req, res, next) => {
  const { name, amount, period, startDate } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ message: "Budget name is required" });
  }

  if (amount == null || isNaN(amount)) {
    return res.status(400).json({ message: "Valid budget amount is required" });
  }

  const validPeriods = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];
  if (!period || !validPeriods.includes(period)) {
    return res.status(400).json({ message: `Period must be one of: ${validPeriods.join(', ')}` });
  }

  if (!startDate || isNaN(Date.parse(startDate))) {
    return res.status(400).json({ message: "Valid start date is required" });
  }

  next();
};

// ✅ Transaction creation validator
export const validateTransaction = (req, res, next) => {
  const { accountId, type, amount, date, description } = req.body;

  if (!accountId) {
    return res.status(400).json({ message: "Account ID is required" });
  }

  const validTypes = ['income', 'expense', 'transfer'];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ message: `Transaction type must be one of: ${validTypes.join(', ')}` });
  }

  if (amount == null || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: "Valid transaction amount is required" });
  }

  if (!date || isNaN(Date.parse(date))) {
    return res.status(400).json({ message: "Valid transaction date is required" });
  }

  if (!description || description.trim().length === 0) {
    return res.status(400).json({ message: "Transaction description is required" });
  }

  next();
};

// ✅ Centralized error handler (placeholder)
export const handleValidationErrors = (req, res, next) => {
  next();
};