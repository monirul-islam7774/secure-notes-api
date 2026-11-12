import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
  },
  { timestamps: true },
);

// Indexes
// GET /users/:id/posts $lookup (author = user._id, sorted _id desc); also admin cascade delete by author.
postSchema.index({ author: 1, _id: -1 });

export const Post = mongoose.model('Post', postSchema);
