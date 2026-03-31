import Story from "../models/Story.js";

const resolveUserServiceUrl = () => {
    const baseUrl = process.env.USER_SERVICE_URL || 'http://localhost:3001';
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
};

const getAllowedStoryUserIds = async (req, userId) => {
    const userServiceUrl = resolveUserServiceUrl();

    try {
        const response = await fetch(`${userServiceUrl}/api/users/connections`, {
            method: 'GET',
            headers: {
                Authorization: req.headers.authorization || '',
                Cookie: req.headers.cookie || ''
            }
        });

        if (!response.ok) {
            throw new Error(`User service responded with ${response.status}`);
        }

        const data = await response.json();
        if (!data?.success) {
            throw new Error(data?.message || 'Failed to fetch user connections');
        }

        const relatedUsers = [
            ...(Array.isArray(data.connections) ? data.connections : []),
            ...(Array.isArray(data.following) ? data.following : [])
        ];

        const relatedIds = relatedUsers
            .map((user) => user?._id)
            .filter(Boolean)
            .map((id) => id.toString());

        return [...new Set([userId.toString(), ...relatedIds])];
    } catch (error) {
        console.error('Story visibility fallback to self only:', error.message);
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