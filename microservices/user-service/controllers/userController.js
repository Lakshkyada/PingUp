import User from "../models/User.js";
import { error } from "console";
import  Connection from "../models/Connection.js";
import Post from "../models/Post.js";
import { redisClient } from "../configs/redis.js";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { inngest } from "../inngest/index.js";
import imagekit from "../configs/imageKit.js";
import { randomUUID } from 'crypto';
import { publishFeedEvent } from '../configs/rabbitmq.js';

const USER_CACHE_TTL = 60 * 5; // 5 minutes

const publishUserEvent = async (routingKey, payload) => {
    try {
        const event = {
            event: routingKey,
            eventId: randomUUID(),
            version: 1,
            occurredAt: new Date().toISOString(),
            ...payload,
        };

        await publishFeedEvent(routingKey, event);
        console.log(`User Service: Published ${routingKey} event`, { eventId: event.eventId });
    } catch (error) {
        console.error(`Failed to publish ${routingKey} event:`, error.message);
    }
};

const safeRedisSet = async (key, value, options = {}) => {
    if (!redisClient?.isReady) return;
    try {
        await redisClient.set(key, value, options);
    } catch (redisError) {
        console.error('Redis write error:', redisError.message);
    }
};

const safeRedisDel = async (...keys) => {
    if (!redisClient?.isReady || keys.length === 0) return;
    try {
        await redisClient.del(keys);
    } catch (redisError) {
        console.error('Redis delete error:', redisError.message);
    }
};

const getImageKitPathFromUrl = (inputUrl) => {
    try {
        const parsed = new URL(inputUrl);
        let normalizedPath = parsed.pathname;

        // Remove urlEndpoint pathname prefix if present (for example: /your_imagekit_id)
        // so ImageKit gets only the file path segment.
        if (process.env.IMAGEKIT_URL_ENDPOINT) {
            const endpointPath = new URL(process.env.IMAGEKIT_URL_ENDPOINT).pathname;
            if (endpointPath && normalizedPath.startsWith(endpointPath)) {
                normalizedPath = normalizedPath.slice(endpointPath.length);
            }
        }

        return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    } catch {
        return '';
    }
};

const getTransformedImageUrl = (inputUrl, width = '512') => {
    const path = getImageKitPathFromUrl(inputUrl);
    if (!path) return inputUrl;

    return imagekit.url({
        path,
        transformation: [
            { quality: 'auto' },
            { format: 'webp' },
            { width }
        ]
    });
};

// Register User
export const registerUser = async (req, res) => {
    try {
        const { email, password, username, full_name } = req.body;
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.json({ success: false, message: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword, username, full_name });
        await user.save();

        await publishUserEvent('user.created', {
            user: {
                user_id: user._id.toString(),
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                bio: user.bio || '',
                location: user.location || '',
                profile_picture: user.profile_picture || '',
                followers_count: Array.isArray(user.followers) ? user.followers.length : 0,
                created_at: user.createdAt,
            },
        });
        
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.json({ success: true, message: 'User registered successfully', token });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Login User
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
        res.json({ success: true, message: 'Login successful', token });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Get User Data using userID
export const getUserData = async (req, res) => {
     try{
        const userId = req.user.id;
        const cacheKey = `user:${userId}`;

        let cachedUser = null;
        if (redisClient?.isReady) {
             try {
                  cachedUser = await redisClient.get(cacheKey);
             } catch (redisError) {
                  console.error('Redis read error:', redisError.message);
             }
        }

        if (cachedUser) {
             const user = JSON.parse(cachedUser);
             return res.json({success: true, user, cached: true});
        }

        const user = await User.findById(userId);
        if(!user){
             return res.json({success: false, message: "User not found"});
        }

           await safeRedisSet(cacheKey, JSON.stringify(user), {
               EX: USER_CACHE_TTL
           });

        res.json({success: true, user, cached: false});
     } catch (error){
        console.log(error);
        res.json({success: false, message: error.message})
     }
}

// Update User Data
export const updateUserData = async (req, res) => {
     try{
        const userId = req.user.id;
    let {username, bio, location, full_name, profile_url, cover_url} = req.body;
        
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
        
           if(profile_url){
               updateData.profile_picture = getTransformedImageUrl(profile_url);
           }

           if(cover_url){
               updateData.cover_photo = getTransformedImageUrl(cover_url, '1280');
           }

        const user = await User.findByIdAndUpdate(userId, updateData, {new : true});
        const cacheKey = `user:${userId}`;
           await safeRedisSet(cacheKey, JSON.stringify(user), {
             EX: USER_CACHE_TTL
        });

        await publishUserEvent('user.updated', {
            user: {
                user_id: user._id.toString(),
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                bio: user.bio || '',
                location: user.location || '',
                profile_picture: user.profile_picture || '',
                followers_count: Array.isArray(user.followers) ? user.followers.length : 0,
                created_at: user.createdAt,
            },
        });

        console.log("User updated:", user);
        res.json({success: true, user, message: 'Profile updated successfully'});
     } catch (error){
        console.log(error);
        res.json({success: false, message: error.message})
     }
}

// Follow User
export const followUser = async (req, res) => {
     try{
         const userId = req.user.id;
         const {id} = req.body;

         if (userId === id) {
             return res.json({success: false, message: 'You cannot follow yourself'})
         }

         const user = await User.findById(userId).select('following').lean();

         if(user?.following?.map(f => f.toString()).includes(id)){
             return res.json({success: false, message: 'You are already following this user'})
         }

         await Promise.all([
             User.updateOne({ _id: userId }, { $addToSet: { following: id } }),
             User.updateOne({ _id: id }, { $addToSet: { followers: userId } })
         ]);

         // Invalidate cached user data to reflect follow changes immediately
         await safeRedisDel(`user:${userId}`, `user:${id}`)

         await publishUserEvent('user.followed', {
             followerId: userId,
             followingId: id,
         });

         res.json({success: true, message: 'Now you are following this user'})
     } catch(error){
         console.log(error);
         res.json({success: false, message: error.message})
     }
}

// Unfollow User
export const unfollowUser = async (req, res) => {
     try{
         const userId = req.user.id;
         const {id} = req.body;

         if (userId === id) {
             return res.json({success: false, message: 'You cannot unfollow yourself'})
         }

         await Promise.all([
             User.updateOne({ _id: userId }, { $pull: { following: id } }),
             User.updateOne({ _id: id }, { $pull: { followers: userId } })
         ]);

         // Invalidate cached user data to reflect unfollow changes immediately
         await safeRedisDel(`user:${userId}`, `user:${id}`)

         await publishUserEvent('user.unfollowed', {
             followerId: userId,
             followingId: id,
         });

         res.json({success: true, message: 'Now you no longer following this user'})
     } catch(error){
         console.log(error);
         res.json({success: false, message: error.message})
     }
}

// Send Connection Request
export const sendConnectionRequest = async (req, res) => {
    try{
        const userId = req.user.id;
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
              try {
                 await inngest.send({
                     name: 'app/connection-request',
                     data: {connectionId: newConnection._id}
                 })
              } catch (inngestError) {
                 console.error('Failed to enqueue connection request event:', inngestError.message)
              }
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
        const userId = req.user.id;
        const user = await User.findById(userId).populate('connections followers following')

        const connections = user.connections;
        const followers = user.followers;
        const following = user.following;

        const incomingPendingDocs = await Connection.find({
            to_user_id: userId,
            status: 'pending'
        });

        const outgoingPendingDocs = await Connection.find({
            from_user_id: userId,
            status: 'pending'
        });

        const incomingUserIds = incomingPendingDocs.map((connection) => connection.from_user_id);
        const outgoingUserIds = outgoingPendingDocs.map((connection) => connection.to_user_id);

        const [incomingUsers, outgoingUsers] = await Promise.all([
            User.find({ _id: { $in: incomingUserIds } }),
            User.find({ _id: { $in: outgoingUserIds } })
        ]);

        const incomingPending = incomingUsers.map((pendingUser) => ({
            ...pendingUser.toObject(),
            requestType: 'incoming',
        }));

        const outgoingPending = outgoingUsers.map((pendingUser) => ({
            ...pendingUser.toObject(),
            requestType: 'outgoing',
        }));

        const pendingConnections = [...incomingPending, ...outgoingPending];

        res.json({success: true, connections, followers, following, pendingConnections});
    } catch (error){
         console.log(error);
         res.json({success: false, message: error.message})
    }
}

//Acept Connection Request
export const acceptConnectionRequest = async (req, res) => {
    try{
        const userId = req.user.id;
        const {id} = req.body;
        // console.log("id from body:", id)
        // console.log("logged in userId:", userId)
        const connection = await Connection.findOne({ from_user_id: id,to_user_id: userId})
        if(!connection){
             return  res.json({ success: false, message: 'Connection not found'});
        }

        await Promise.all([
            User.updateOne({ _id: userId }, { $addToSet: { connections: id } }),
            User.updateOne({ _id: id }, { $addToSet: { connections: userId } }),
            Connection.updateOne({ _id: connection._id }, { $set: { status: 'accepted' } })
        ]);

        await publishUserEvent('connection.accepted', {
            userAId: userId,
            userBId: id,
        });
        
        res.json({success: true, message: 'Connection accepted successfully'})
    } catch (error){
         console.log(error);
         res.json({success: false, message: error.message})
    }
}

// Reject Connection Request
export const rejectConnectionRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.body;

        const connection = await Connection.findOne({
            from_user_id: id,
            to_user_id: userId,
            status: 'pending'
        });

        if (!connection) {
            return res.json({ success: false, message: 'Pending connection not found' });
        }

        await connection.deleteOne();

        await publishUserEvent('connection.rejected', {
            requesterId: id,
            receiverId: userId,
        });

        res.json({ success: true, message: 'Connection rejected successfully' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

//Get user profiles
export const getUserProfile = async (req, res) => {
    try {
        // console.log('Incoming headers:', req.headers);       
        const {profileId} = req.body;
        const profile = await User.findById(profileId)
        if(!profile){
            return res.json({success: false, message: 'profile not found'})
        }
        const posts = await Post.find({user: profileId}).populate('user')
        // console.log("Profile fetched:", posts);
        return res.json({success: true, profile, posts})
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

// Provide signed upload parameters for direct client uploads to ImageKit.
export const getImageKitAuth = async (req, res) => {
    try {
        if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
            console.error('ImageKit credentials missing:', {
                hasPublicKey: !!process.env.IMAGEKIT_PUBLIC_KEY,
                hasPrivateKey: !!process.env.IMAGEKIT_PRIVATE_KEY,
                hasUrlEndpoint: !!process.env.IMAGEKIT_URL_ENDPOINT
            });
            return res.status(500).json({ 
                success: false, 
                message: 'ImageKit credentials are not configured on server' 
            });
        }

        const auth = imagekit.getAuthenticationParameters();
        console.log('Generated ImageKit auth parameters for user:', {
            userId: req.user.id,
            timestamp: auth.timestamp,
            token: auth.token
        });
        res.json({
            success: true,
            auth: {
                ...auth,
                publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
                urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
            },
        });
    } catch (error) {
        console.error('ImageKit auth error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};