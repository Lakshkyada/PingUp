import express from 'express';
import {
    getUserData,
    updateUserData,
    followUser,
    unfollowUser,
    sendConnectionRequest,
    getUserConnections,
    acceptConnectionRequest,
    rejectConnectionRequest,
    getUserProfile,
    getImageKitAuth
} from '../controllers/userController.js';
import auth from '../middlewares/auth.js';

const router = express.Router();

// Protected routes
router.get('/me', auth, getUserData);
router.put('/update', auth, updateUserData);
router.post('/update', auth, updateUserData);
router.post('/follow', auth, followUser);
router.post('/unfollow', auth, unfollowUser);
router.post('/connect', auth, sendConnectionRequest);
router.get('/connections', auth, getUserConnections);
router.post('/accept-connection', auth, acceptConnectionRequest);
router.post('/reject-connection', auth, rejectConnectionRequest);
router.post('/profile', auth, getUserProfile);
router.get('/imagekit-auth', auth, getImageKitAuth);

export default router;