import { err } from "inngest/types";
import fs from 'fs'
import imagekit from "../configs/imageKit.js";
import User from "../models/User.js";
import { error } from "console";
import  Connection from "../models/Connection.js";
import Post from "../models/Post.js";
import { inngest } from "../inngest/index.js";

// Get User Data using userID
export const getUserData = async (req, res) => {
     try{
        const {userId} = req.auth()
        const user = await User.findById(userId)
        if(!user){
             return  res.json({success: false, message: "User not found"});
        }
        res.json({success: true, user})
     } catch (error){
        console.log(error);
        res.json({success: false, message: error.message})
     }
}

// Update User Data
export const updateUserData = async (req, res) => {
     try{
        const {userId} = req.auth()
        let {username, bio, location, full_name} = req.body;
        
        const tempUser = await User.findById(userId)

        !username && (username = tempUser.username)

        if(tempUser.username !== username){
             const user = await User.findOne({username})
             if(user){
                // we will change username if it is already taken
                username = tempUser.username
             }
        }
        const updateData = {
              username,
              bio,
              location,
              full_name,
        }

        const profile = req.files.profile && req.files.profile[0]
        const cover = req.files.cover && req.files.cover[0]
        
        if(profile){
             const buffer = fs.readFileSync(profile.path)
             const response = await imagekit.upload({
                 file: buffer,
                 fileName: profile.originalname,
             })

             const url = imagekit.url({
                 path: response.filePath,
                 transformation: [
                    {quality: 'auto'},
                    {format: 'webp'},
                    {width: '512'}
                 ]
             })
             updateData.profile_picture = url;
        }

        if(cover){
             const buffer = fs.readFileSync(cover.path)
             const response = await imagekit.upload({
                 file: buffer,
                 fileName: profile.originalname,
             })

             const url = imagekit.url({
                 path: response.filePath,
                 transformation: [
                    {quality: 'auto'},
                    {format: 'webp'},
                    {width: '1280'}
                 ]
             })
             updateData.cover_photo = url;
        }

        const user = await User.findByIdAndUpdate(userId, updateData, {new : true})
        
        res.json({success: true, user, message: 'Profile updated successfully'})
     } catch (error){
        console.log(error);
        res.json({success: false, message: error.message})
     }
}

// find Users using username, email, location, name
export const discoverUsers = async (req, res) => {
     try{
         const {userId} = req.auth()
         const {input} = req.body;

         const allUsers = await User.find(
            {
                $or: [
                    {username: new RegExp(input, 'i')},
                    {email: new RegExp(input, 'i')},
                    {full_name: new RegExp(input, 'i')},
                    {location: new RegExp(input, 'i')},
                ]
            }
         )
         const filteredUsers = allUsers.filter(user => user._id !== userId);

         res.json({success:true, users: filteredUsers})

     } catch(error){
         console.log(error);
         res.json({success: false, message: error.message})
     }
}

// Follow User
export const followUser = async (req, res) => {
     try{
         const {userId} = req.auth()
         const {id} = req.body;

         const user = await User.findById(userID)
        
         if(user.following.includes(id)){
             return res.json({success: false, message: 'You are already following this user'})
         }
         
         user.following.push(id);
         await user.save()

         const toUser = await User.findById(id)
         toUser.followers.push(userId)
         await toUser.save()

         res.json({success: true, message: 'Now you are following this user'})
     } catch(error){
         console.log(error);
         res.json({success: false, message: error.message})
     }
}

// Unfollow User
export const unfollowUser = async (req, res) => {
     try{
         const {userId} = req.auth()
         const {id} = req.body;

         const user = await User.findById(userID)
         user.following = user.following.filter(user => user !== id)
         await user.save()

         const toUser = await User.findById(id)
         toUser.followers = toUser.followers.filter(user => user !== userID)
         await toUser.save()

         res.json({success: true, message: 'Now you no longer following this user'})
     } catch(error){
         console.log(error);
         res.json({success: false, message: error.message})
     }
}

// Send Connection Request
export const sendConnectionRequest = async (req, res) => {
    try{
        const {userId} = req.auth()
        const {id} = req.body;

        // check if user has sent more than 20 req in last 24 hours
        const last24Hours = new Date(Date.now() - 24*60*60*1000)
        const connectionRequest = await Connection.find({from_user_id: userId, created_at: {$gt: last24Hours}})
        if(connectionRequest.length >= 20){
             return  res.json({success: false, message: 'You have sent more than 20 connection request in the last 24 Hours'});
        }

        // Check if users are already conected
        const connection = await Connection.findOne({
            $or: [
                {from_user_id: userId, to_user_id: id},
                {from_user_id: id, to_user_id: userId}
            ]
        })

        if(!connection){
            const newConnection = await Connection.create({
                 from_user_id: userId,
                 to_user_id: id
            })
            await inngest.send({
                 name: 'app/connection-request',
                 data: {connectionId: newConnection._id}
            })
            return res.json({success: true, message: 'Connection request sent successfully'})
        } else if(connection && connection.status === 'accepted'){
             return res.json({success: false, message: 'You are already connected with this user'})
        }
        return res.json({success: false, message: 'Connection request pending'})
    } catch (error){
         console.log(error);
         res.json({success: false, message: error.message})
    }
}

// Get user connections
export const getUserConnections = async (req, res) => {
    try{
        const {userId} = req.auth()
        const user = await User.findById(userId).populate('connections followers following')

        const connections = user.connections;
        const followers = user.followers;
        const following = user.following;

        const pendingConnections = (await Connection.find({to_user_id: userId, status: 'pending'})
        .populate('from_user_id')).map(connection=>connection.from_user_id)

         res.json({success: true, connections, followers, following, pendingConnections});
    } catch (error){
         console.log(error);
         res.json({success: false, message: error.message})
    }
}

//Acept Connection Request
export const acceptConnectionRequest = async (req, res) => {
    try{
        const {userId} = req.auth()
        const {id} = req.body;

        const connection = await Connection.findOne({from_user_id: id,to_user_id: userId})
        if(!connection){
             return  res.json({ success: false, message: 'Connection not found'});
        }

        const user = await User.findById(userId)
        user.connections.push(id)
        await user.save()

        const toUser = await User.findById(id)
        toUser.connections.push(userId)
        await toUser.save()

        connection.status = 'accepted'
        await connection.save()

        res.json({success: true, message: 'Connection accepted successfully'})
    } catch (error){
         console.log(error);
         res.json({success: false, message: error.message})
    }
}

//Get user profiles
export const getUserProfile = async (req, res) => {
    try {
        const {profileId} = req.body;
        const profile = await User.findById(profileId)
        if(!profile){
            return res.json({success: false, message: 'profile not found'})
        }
        const posts = await Post.find({user: profileId}).populate('user')
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}