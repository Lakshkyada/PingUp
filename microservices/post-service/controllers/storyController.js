import Story from "../models/Story.js";
import UserRelationship from '../models/UserRelationship.js';

const getAllowedStoryUserIds = async (req, userId) => {
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
        const allowedUserIds = await getAllowedStoryUserIds(req, userId);

        const stories = await Story.find({
            user: { $in: allowedUserIds }
        }).populate('user').sort({ createdAt: -1 });

        res.json({ success: true, stories });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};