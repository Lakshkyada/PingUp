import express from 'express'
import { upload } from '../configs/multer.js'
import { addPost, getFeedPosts, likePosts } from '../controllers/postController.js'
import authMiddleware from '../middlewares/auth.js'

const postRouter = express.Router()

postRouter.post('/add',  authMiddleware, upload.array('images', 4), addPost)
postRouter.get('/feed', authMiddleware, getFeedPosts)
postRouter.post('/like', authMiddleware, likePosts)

export default postRouter