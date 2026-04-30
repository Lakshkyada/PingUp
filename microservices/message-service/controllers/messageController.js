import Message from "../models/Message.js";
import User from "../models/User.js";

// Keep active SSE streams keyed by user id.
const connections = new Map();

const toUserPayload = (userDoc, fallbackId) => ({
    _id: String(userDoc?._id ?? fallbackId ?? ''),
    username: userDoc?.username ?? '',
    full_name: userDoc?.full_name ?? '',
    profile_picture: userDoc?.profile_picture ?? '',
});

const hydrateMessages = async (messages, { hydrateFromOnly = false } = {}) => {
    const ids = new Set();

    for (const message of messages) {
        if (message?.from_user_id) ids.add(String(message.from_user_id));
        if (!hydrateFromOnly && message?.to_user_id) ids.add(String(message.to_user_id));
    }

    const snapshots = ids.size
        ? await User.find({ _id: { $in: Array.from(ids) } })
            .select('_id username full_name profile_picture')
            .lean()
        : [];

    const usersById = new Map(snapshots.map((user) => [String(user._id), user]));

    return messages.map((message) => {
        const fromId = String(message.from_user_id ?? '');
        const toId = String(message.to_user_id ?? '');
        const fromSnapshot = usersById.get(fromId);
        const toSnapshot = usersById.get(toId);

        return {
            ...message,
            from_user_id: toUserPayload(fromSnapshot, fromId),
            to_user_id: hydrateFromOnly
                ? message.to_user_id
                : toUserPayload(toSnapshot, toId),
        };
    });
};

// SSE stream endpoint for a specific user.
export const sseController = (req, res) => {
    const { userId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Ensure the headers are flushed immediately for the stream.
    res.flushHeaders?.();

    connections.set(userId, res);

    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 20000);

    req.on('close', () => {
        clearInterval(keepAlive);
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

        const freshMessage = await Message.findById(message._id).lean();
        const [messageWithUserData] = await hydrateMessages([freshMessage], { hydrateFromOnly: true });

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
        }).sort({ createdAt: 1 }).lean();

        const hydratedMessages = await hydrateMessages(messages);

        // Mark messages as seen
        await Message.updateMany(
            { from_user_id: to_user_id, to_user_id: userId, seen: false },
            { seen: true }
        );

        res.json({ success: true, messages: hydratedMessages });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Get user's recent conversations
export const getUserRecentMessages = async (req, res) => {
    try {
        const userId = req.user.id;

        const allMessages = await Message.find({
            $or: [{ from_user_id: userId }, { to_user_id: userId }]
        }).sort({ createdAt: -1 }).lean();

        const latestByPeerId = new Map();
        for (const message of allMessages) {
            const fromId = String(message.from_user_id);
            const toId = String(message.to_user_id);
            const peerId = fromId === String(userId) ? toId : fromId;

            if (!latestByPeerId.has(peerId)) {
                latestByPeerId.set(peerId, message);
            }
        }

        // Filter to only include conversations with unseen messages
        const unseenConversations = Array.from(latestByPeerId.values()).filter(message => {
            const fromId = String(message.from_user_id);
            const toId = String(message.to_user_id);
            const isFromCurrentUser = fromId === String(userId);
            // If the message is from the current user, it's always "seen" from their perspective
            // If the message is to the current user, check the seen flag
            return isFromCurrentUser ? false : !message.seen;
        });

        const conversations = await hydrateMessages(unseenConversations);
        res.json({ success: true, conversations });
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