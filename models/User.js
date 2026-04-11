import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true }, // ✅ normalize
  password: { type: String, required: true },
  resetToken:        { type: String },        // ✅ add this
  resetTokenExpiry:  { type: Date },   
});

// ✅ REMOVED pre('save') hash — auth.js already hashes before create()
// Only hash if using User.save() directly (like password update in users.js)
UserSchema.pre('save', async function (next) {
  // Only hash if password was manually modified (e.g. profile password update)
  if (!this.isModified('password')) return next();

  // Skip if already hashed (starts with bcrypt prefix)
  if (this.password.startsWith('$2')) return next(); // ✅ prevents double hashing

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ✅ Unified method name
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', UserSchema);