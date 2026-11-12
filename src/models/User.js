import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    interests: { type: [String], default: [] },
  },
  { timestamps: true },
);

// Indexes (single source of truth — none are declared on fields)
// Login lookup + duplicate-email check on register/admin create.
userSchema.index({ email: 1 }, { unique: true });
// GET /users/grouped-by-interest?interest=x — first $match stage.
userSchema.index({ interests: 1 });

export const User = mongoose.model('User', userSchema);
