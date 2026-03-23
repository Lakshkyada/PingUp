import express from 'express'
import { addPost, getFeedPosts, likePosts } from '../controllers/postController.js'
import authMiddleware from '../middlewares/auth.js'

const postRouter = express.Router()

postRouter.post('/add',  authMiddleware, addPost)
postRouter.get('/feed', authMiddleware, getFeedPosts)
postRouter.post('/like', authMiddleware, likePosts)

export default postRouter