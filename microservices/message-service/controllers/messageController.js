import Message from "../models/Message.js";

// Keep active SSE streams keyed by user id.
const connections = new Map();

// SSE stream endpoint for a specific user.
export const sseController = (req, res) => {
    const { userId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    connections.set(userId, res);
    res.write('log: Connected to SSE stream\n\n');

    req.on('close', () => {
        connections.delete(userId);
    });
};

// Send message
export const sendMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { to_user_id, text, media_url } = req.body;

        if (!to_user_id) {
            return res.status(400).json({
                success: false,
                message: "Receiver ID is required"
            });
        }

        let message_type = media_url ? 'image' : 'text';

        if (!text && !media_url) {
            return res.json({ success: false, message: "Message cannot be empty" });
        }

        const message = await Message.create({
            from_user_id: userId,
            to_user_id,
            text,
            message_type,
            media_url
        });

        const messageWithUserData = await Message.findById(message._id).populate('from_user_id');

        res.json({ success: true, message: messageWithUserData });

        // Push message instantly to recipient if they have an active SSE stream.
        const client = connections.get(to_user_id.toString());
        if (client) {
            client.write(`data: ${JSON.stringify(messageWithUserData)}\n\n`);
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Get chat messages between two users
export const getChatMessages = async (req, res) => {
    try {
        const userId = req.user.id;
        const { to_user_id } = req.params;

        const messages = await Message.find({
            $or: [
                { from_user_id: userId, to_user_id },
                { from_user_id: to_user_id, to_user_id: userId }
            ]
        }).populate('from_user_id to_user_id').sort({ createdAt: 1 });

        // Mark messages as seen
        await Message.updateMany(
            { from_user_id: to_user_id, to_user_id: userId, seen: false },
            { seen: true }
        );

        res.json({ success: true, messages });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Get user's recent conversations
export const getUserRecentMessages = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get the latest message for each conversation
        const conversations = await Message.aggregate([
            {
                $match: {
                    $or: [{ from_user_id: userId }, { to_user_id: userId }]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: {
                            if: { $eq: ["$from_user_id", userId] },
                            then: "$to_user_id",
                            else: "$from_user_id"
                        }
                    },
                    lastMessage: { $first: "$$ROOT" }
                }
            },
            {
                $replaceRoot: { newRoot: "$lastMessage" }
            }
        ]);

        // Populate user data
        const populatedConversations = await Message.populate(conversations, [
            { path: 'from_user_id', select: 'username full_name profile_picture' },
            { path: 'to_user_id', select: 'username full_name profile_picture' }
        ]);

        res.json({ success: true, conversations: populatedConversations });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Get unread message count
export const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id;

        const unreadCount = await Message.countDocuments({
            to_user_id: userId,
            seen: false
        });

        res.json({ success: true, unreadCount });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Backward-compatible variant that accepts to_user_id in request body.
export const getChatMessagesByBody = async (req, res) => {
    try {
        const { to_user_id } = req.body;

        if (!to_user_id) {
            return res.status(400).json({ success: false, message: 'to_user_id is required' });
        }

        req.params = { to_user_id };
        return getChatMessages(req, res);
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};