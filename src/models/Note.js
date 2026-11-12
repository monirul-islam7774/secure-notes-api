import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, default: '' },
  },
  { timestamps: true },
);

// Indexes
// GET /notes — a user's own notes, newest first (_id desc), paginated; also owner-scoped delete-many.
noteSchema.index({ owner: 1, _id: -1 });

export const Note = mongoose.model('Note', noteSchema);
