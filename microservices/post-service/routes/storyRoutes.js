import express from 'express';
import { addUserStory, getStories } from '../controllers/storyController.js';
import auth from '../middlewares/auth.js';

const router = express.Router();

// Protected routes
router.post('/', auth, addUserStory);
router.get('/', auth, getStories);

export default router;