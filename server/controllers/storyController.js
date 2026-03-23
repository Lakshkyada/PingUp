import Story from "../models/Story.js";
import User from "../models/User.js";
import { inngest } from "../inngest/index.js";

// Add User Story
export const addUserStory = async (req, res) => {
    try {
        const userId = req.user.id;
        const {content, media_type, background_color, media_url: incomingMediaUrl} = req.body;
        let media_url = incomingMediaUrl || ''

                    if((media_type === 'image' || media_type === 'video') && !media_url){
                         return res.json({success: false, message: 'media_url is required for media stories'})
        }
        // create story
        const story = await Story.create({
            user: userId,
            content,
            media_url,
            media_type,
            background_color
        })

        // Trigger Inngest event to delete story after 24 hours
        await inngest.send({
            name: 'app/story.delete',
            data: { storyId: story._id }
        });

         res.json({success: true});
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

// Get User Story
export const getStories = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId)

        // User connections and following
        const userIds = [userId , ...(Array.isArray(user.connections) ? user.connections : []), 
        ...(Array.isArray(user.following) ? user.following : [])]

        const stories = await Story.find({
             user: {$in: userIds}
        }).populate('user').sort({createdAt: -1})

        res.json({success: true, stories})
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

