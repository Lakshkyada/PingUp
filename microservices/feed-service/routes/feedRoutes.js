import express from 'express';
import auth from '../middlewares/auth.js';
import { getFeedPosts, getDlqStatus } from '../controllers/feedController.js';

const router = express.Router();

// Protected routes
router.get('/posts', auth, getFeedPosts);
router.get('/dlq-status', auth, getDlqStatus);

export default router;
