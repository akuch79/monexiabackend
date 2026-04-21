import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, default: null, unique: true, sparse: true },
  resetToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
  
  // Wallet specific fields
  walletPin: { type: String, default: null },
  preferredCurrency: { type: String, default: 'KES' },
  accountStatus: { type: String, enum: ['active', 'suspended', 'closed'], default: 'active' },
  kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  
  // Limits
  dailyLimit: { type: Number, default: 500000 },
  monthlyLimit: { type: Number, default: 5000000 },
  transactionCount: { type: Number, default: 0 },
  
  // Timestamps
  lastLogin: { type: Date, default: null },
  lastTransaction: { type: Date, default: null },
  
}, { timestamps: true });

// Only hash if password was manually modified and not already hashed
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  if (this.password.startsWith('$2')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Hash wallet pin if set
UserSchema.pre('save', async function (next) {
  if (!this.isModified('walletPin')) return next();
  if (this.walletPin && !this.walletPin.startsWith('$2')) {
    const salt = await bcrypt.genSalt(10);
    this.walletPin = await bcrypt.hash(this.walletPin, salt);
  }
  next();
});

UserSchema.methods.matchWalletPin = async function (enteredPin) {
  if (!this.walletPin) return false;
  return await bcrypt.compare(enteredPin, this.walletPin);
};

export default mongoose.model('User', UserSchema);