import express from 'express';
import { searchUsers, globalSearch } from '../controllers/searchController.js';
import auth from '../middlewares/auth.js';

const router = express.Router();

// Protected routes
router.get('/users', auth, searchUsers);
router.get('/global', auth, globalSearch);

export default router;