import Story from "../models/Story.js";
import UserRelationship from '../models/UserRelationship.js';
import User from '../models/User.js';

const getAllowedStoryUserIds = async (userId) => {
    try {
        const relationship = await UserRelationship.findOne({ user_id: userId })
            .select('connections following')
            .lean();

        const relatedIds = [
            ...(Array.isArray(relationship?.connections) ? relationship.connections : []),
            ...(Array.isArray(relationship?.following) ? relationship.following : [])
        ]
            .filter(Boolean)
            .map((id) => id.toString());

        return [...new Set([userId.toString(), ...relatedIds])];
    } catch (error) {
        console.error('Story visibility fallback to self only from local relationship cache:', error.message);
        return [userId.toString()];
    }
};

// Add User Story
export const addUserStory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { content, media_type, background_color, media_url } = req.body;
        console.log('Received story data:', req.body);
        if ((media_type === 'image' || media_type === 'video') && !media_url) {
            return res.json({ success: false, message: 'media_url is required for media stories' });
        }
        
        // Ensure User snapshot exists for story population
        const userSnapshotExists = await User.findById(userId);
        if (!userSnapshotExists) {
            // Create a minimal placeholder until consumer updates it with full data
            await User.findByIdAndUpdate(
                userId,
                {
                    full_name: req.user.full_name || 'User',
                    username: req.user.username || 'user',
                    profile_picture: req.user.profile_picture || ''
                },
                { upsert: true, new: true }
            );
        }
        
        // Ensure UserRelationship snapshot exists
        await UserRelationship.updateOne(
            { user_id: userId },
            { $setOnInsert: { user_id: userId, followers: [], following: [], connections: [] } },
            { upsert: true }
        );
        
        // create story
        await Story.create({
            user: userId,
            content,
            media_url,
            media_type,
            background_color
        });

        res.json({ success: true });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Get User Story
export const getStories = async (req, res) => {
    try {
        const userId = req.user.id;
        const allowedUserIds = await getAllowedStoryUserIds(userId);

        const stories = await Story.find({
            user: { $in: allowedUserIds }
        }).populate('user').sort({ createdAt: -1 });

        res.json({ success: true, stories });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};