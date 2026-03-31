import express from 'express';
import {
    sseController,
    sendMessage,
    getChatMessages,
    getChatMessagesByBody,
    getUserRecentMessages,
    getUnreadCount
} from '../controllers/messageController.js';
import auth from '../middlewares/auth.js';

const router = express.Router();

// SSE stream route
router.get('/sse/:userId', sseController);

// Protected routes
router.post('/', auth, sendMessage);
router.post('/get', auth, getChatMessagesByBody);
router.get('/chat/:to_user_id', auth, getChatMessages);
router.get('/recent', auth, getUserRecentMessages);
router.get('/unread', auth, getUnreadCount);

export default router;