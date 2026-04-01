import mongoose from 'mongoose';

// Schema that matches post-service Post collection
const postSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: { type: String },
  image_urls: [{ type: String }],
  post_type: { type: String, enum: ['text', 'image', 'text_with_image'] },
  likes_count: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

const Post = mongoose.model('Post', postSchema);

export default Post;
