import express from 'express'
import authMiddleware from '../middlewares/auth.js'
import { addUserStory, getStories} from '../controllers/storyController.js'

const storyRouter = express.Router()

storyRouter.post('/create', authMiddleware, addUserStory)
storyRouter.get('/get', authMiddleware, getStories)

export default storyRouter