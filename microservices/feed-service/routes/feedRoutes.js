import express from 'express';
import auth from '../middlewares/auth.js';
import { getFeedPosts } from '../controllers/feedController.js';

const router = express.Router();

// Protected routes
router.get('/posts', auth, getFeedPosts);

export default router;
