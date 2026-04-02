import express from 'express';
import { addPost, likePosts, getImageKitAuth, getPostsByUser } from '../controllers/postController.js';
import auth from '../middlewares/auth.js';

const router = express.Router();

// Protected routes
router.post('/', auth, addPost);
router.post('/add', auth, addPost);
router.post('/like', auth, likePosts);
router.get('/imagekit-auth', auth, getImageKitAuth);
router.get('/user/:userId', auth, getPostsByUser);

export default router;