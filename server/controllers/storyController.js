import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Story from "../models/Story.js";
import User from "../models/User.js";

// Add User Story
export const addUserStory = async (req, res) => {
    try {
        const userId = req.user.id;
        const {content, media_type, background_color} = req.body;
        const media = req.file
        let media_url = ''
        // console.log('File:', req.file);
        // console.log('Body:', req.body);

        //upload media to imageKit
        if(media_type === 'image' || media_type === 'video'){
             const fileBuffer = fs.readFileSync(media.path)
             const response = await imagekit.upload({
                   file: fileBuffer,
                   fileName: media.originalname,
             })
             media_url = response.url
        }
        // create story
        const story = await Story.create({
            user: userId,
            content,
            media_url,
            media_type,
            background_color
        })

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

