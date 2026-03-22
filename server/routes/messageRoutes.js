import express from 'express'
import { getChatMessages, sendMessage, sseController } from '../controllers/messageController.js';
import { upload } from '../configs/multer.js';
import authMiddleware from '../middlewares/auth.js';

const messageRouter = express.Router();

messageRouter.get('/:userId', sseController);
messageRouter.post('/send', authMiddleware, upload.single('image'), sendMessage)
messageRouter.post('/get', authMiddleware, getChatMessages)

export default messageRouter