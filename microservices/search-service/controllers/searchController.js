import User from "../models/User.js";
import Post from "../models/Post.js";

// Search Users
export const searchUsers = async (req, res) => {
    try {
        const userId = req.user.id;
        const { query } = req.query;

        if (!query || query.trim() === '') {
            return res.json({ success: true, users: [] });
        }

        const users = await User.find({
            $or: [
                { username: new RegExp(query, 'i') },
                { email: new RegExp(query, 'i') },
                { full_name: new RegExp(query, 'i') },
                { location: new RegExp(query, 'i') },
            ]
        }).select('-password');

        const filteredUsers = users.filter(user => user._id.toString() !== userId);

        res.json({ success: true, users: filteredUsers });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Search Posts
export const searchPosts = async (req, res) => {
    try {
        const { query } = req.query;

        if (!query || query.trim() === '') {
            return res.json({ success: true, posts: [] });
        }

        const posts = await Post.find({
            content: new RegExp(query, 'i')
        }).populate('user', 'username full_name profile_picture').sort({ createdAt: -1 });

        res.json({ success: true, posts });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Global Search (users and posts)
export const globalSearch = async (req, res) => {
    try {
        const userId = req.user.id;
        const { query } = req.query;

        if (!query || query.trim() === '') {
            return res.json({ success: true, users: [], posts: [] });
        }

        // Search users
        const users = await User.find({
            $or: [
                { username: new RegExp(query, 'i') },
                { full_name: new RegExp(query, 'i') },
                { location: new RegExp(query, 'i') },
            ]
        }).select('-password');

        const filteredUsers = users.filter(user => user._id.toString() !== userId);

        // Search posts
        const posts = await Post.find({
            content: new RegExp(query, 'i')
        }).populate('user', 'username full_name profile_picture').sort({ createdAt: -1 }).limit(20);

        res.json({ success: true, users: filteredUsers, posts });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};