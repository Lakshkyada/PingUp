import express from 'express'
import { upload } from '../configs/multer.js'
import authMiddleware from '../middlewares/auth.js'
import { addUserStory, getStories} from '../controllers/storyController.js'

const storyRouter = express.Router()

storyRouter.post('/create', authMiddleware, upload.single('media'), addUserStory)
storyRouter.get('/get', authMiddleware, getStories)

export default storyRouter