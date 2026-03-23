import express from 'express'
import authMiddleware from '../middlewares/auth.js';
import { acceptConnectionRequest, discoverUsers, followUser, getUserConnections, getUserData, getUserProfile, loginUser, registerUser, sendConnectionRequest, unfollowUser, updateUserData } from '../controllers/userController.js';
import { getUserRecentMessages } from '../controllers/messageController.js';

const userRouter = express.Router();

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out successfully' });
})
userRouter.get('/data', authMiddleware, getUserData)
userRouter.post('/update', authMiddleware, updateUserData)
userRouter.post('/discover', authMiddleware, discoverUsers)
userRouter.post('/follow', authMiddleware, followUser)
userRouter.post('/unfollow', authMiddleware, unfollowUser)
userRouter.post('/connect', authMiddleware, sendConnectionRequest)
userRouter.post('/accept', authMiddleware, acceptConnectionRequest)
userRouter.get('/connections', authMiddleware, getUserConnections)
userRouter.post('/profiles', getUserProfile)
userRouter.get('/recent-messages', authMiddleware, getUserRecentMessages)
export default userRouter