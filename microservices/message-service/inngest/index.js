import { Inngest } from "inngest";
import User from '../models/User.js'
import Message from "../models/Message.js";
import sendEmail from "../configs/nodeMailer.js";
// Create a client to send and receive events
export const inngest = new Inngest({ id: "pingup-app", isDev: true  });



 const sendNotificationUnseenMessages = inngest.createFunction(
    {
       id:'send-unseen-messages-notification',
       triggers: { cron: 'TZ=America/New_York 0 9 * * *' }
    },
     async ({step}) => {
         const messages = await Message.find({seen: false}).populate('to_user_id');
         const unseenCount = {}

         messages.map(message => {
             unseenCount[message.to_user_id._id] = (unseenCount[message.to_user_id._id] || 0) + 1;
         })

         for(const userId in unseenCount){
             const user = await User.findById(userId)

             const subject = ` You have ${unseenCount[userId]} unseen messages`;

             const body = `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Hi ${user.full_name},</h2>
                    <p>You are ${unseenCount[userId]} unseen messages</p>
                    <p>Click <a href="${process.env.FRONTEND_URL}/messages" style="color: #10b981;">
                         Here
                    </a> to view them</p>
                    <p>Thanks, <br/> PingUp - Stay Connected</p>
               </div>
             `
             await sendEmail({
                 to: user.email,
                 subject,
                 body
             })
         }
         return {messages: 'Notification sent.'}
     }
 )
// Create an array where we'll export future Inngest functions
export const functions = [sendNotificationUnseenMessages];