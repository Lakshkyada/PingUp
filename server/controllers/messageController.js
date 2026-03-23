import Message from '../models/Message.js';

// SS = server side
// create an empty object to store SS Event connections
const connections= new Map();

// Controller funtion for the SSE endpoint
export const sseController = (req, res) => {
     const {userId} = req.params
     console.log('New client connected55665 : ', userId);

     // Set SSE headers
     res.setHeader('Content-Type', 'text/event-stream');
     res.setHeader('Cache-Control', 'no-cache');
     res.setHeader('Connection', 'keep-alive');
     res.setHeader('Access-Control-Allow-Origin', '*');

     // Add the client's response object to the connections object
     connections.set(userId, res);  

     // send an initial event to the client
     res.write('log: Connected to SSE stream\n\n');

     // Handle client discoonection
     req.on('close', ()=>{
         // Remove the client's response object from the connections array
         connections.delete(userId);
         console.log('Client disconnected');
     })    
}

// send message
export const sendMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const {to_user_id, text, media_url: incomingMediaUrl} = req.body
        if (!to_user_id) {
            return res.status(400).json({
                success: false,
                message: "Receiver ID is required"
            });
        }
        let media_url = incomingMediaUrl || ''
        let message_type = media_url ? 'image' : 'text'
        if (!text && !media_url) {
            return res.json({ success: false, message: "Message cannot be empty" });
        }
        
        const message = await Message.create({
            from_user_id: userId,
            to_user_id,
            text,
            message_type,
            media_url
        })

        res.json({success: true, message});

        //send message to to_user_id using SSE

        const messageWithUserData = await Message.findById(message._id).
        populate('from_user_id');

        const client = connections.get(to_user_id);
        if (client) {
            client.write(`data: ${JSON.stringify(messageWithUserData)}\n\n`);
        }
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

// get chat message
export const getChatMessages = async (req, res) => {
    try {
        const userId = req.user.id;
        // console.log('User ID:', userId);
        let {to_user_id} = req.body;
        console.log('To User ID:', to_user_id);
        
        // Handle case where to_user_id is passed as an object
        if (typeof to_user_id === 'object' && to_user_id !== null && to_user_id.userId) {
            to_user_id = to_user_id.userId;
        }
        
        const messages = await Message.find({
            $or: [
                {from_user_id: userId, to_user_id},
                {from_user_id: to_user_id, to_user_id: userId}
            ]
        }).sort({createdAt: -1})
        // mark messages as seen
        await Message.updateMany({from_user_id: to_user_id, to_user_id: userId}, {seen: true})
        res.json({success: true, messages});
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

// get chat message
export const getUserRecentMessages = async (req, res) => {
    try {
        const userId = req.user.id;
        const messages = await Message.find({to_user_id: userId}).populate
        ('from_user_id to_user_id').sort({created_at: -1});

        res.json({success: true, messages});
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

