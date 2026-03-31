import express from 'express';
import { registerUser, loginUser, verifyToken, logoutUser } from '../controllers/authController.js';

const router = express.Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.get('/verify', verifyToken);

export default router;