import User from '../models/User.js';
import Post from '../models/Post.js';

export const getFeedPosts = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select('connections following');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const feedUserIds = [
      userId,
      ...(user.connections || []).map((id) => id.toString()),
      ...(user.following || []).map((id) => id.toString())
    ];

    const uniqueFeedUserIds = [...new Set(feedUserIds)];

    const posts = await Post.find({
      user: { $in: uniqueFeedUserIds }
    })
      .populate('user', 'username full_name profile_picture')
      .sort({ createdAt: -1 });

    res.json({ success: true, posts });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};
