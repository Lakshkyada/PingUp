import express from 'express';
import {
    getUserData,
    updateUserData,
    discoverUsers,
    followUser,
    unfollowUser,
    sendConnectionRequest,
    getUserConnections,
    acceptConnectionRequest,
    getUserProfile,
    getImageKitAuth
} from '../controllers/userController.js';
import auth from '../middlewares/auth.js';

const router = express.Router();

// Protected routes
router.get('/me', auth, getUserData);
router.put('/update', auth, updateUserData);
router.post('/update', auth, updateUserData);
router.post('/discover', auth, discoverUsers);
router.post('/follow', auth, followUser);
router.post('/unfollow', auth, unfollowUser);
router.post('/connect', auth, sendConnectionRequest);
router.get('/connections', auth, getUserConnections);
router.post('/accept-connection', auth, acceptConnectionRequest);
router.post('/profile', auth, getUserProfile);
router.get('/imagekit-auth', auth, getImageKitAuth);

export default router;