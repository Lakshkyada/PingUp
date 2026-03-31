import { Inngest } from "inngest";
import User from '../models/User.js'
import Connection from "../models/Connection.js";
import sendEmail from "../configs/nodeMailer.js";
// Create a client to send and receive events
export const inngest = new Inngest({ id: "pingup-app", isDev: true  });



// Inngest Funtion to send Reminder when a new connection request is added
const sendNewConnectionRequestReminder = inngest.createFunction(
   {
      id: 'send-new-connection-request-reminder',
      triggers: { event: "app/connection-request" }
   },
    async ({event, step}) => {
       const {connectionId} = event.data;

       await step.run('send-connection-request-mail', async () => {
          const connection = await Connection.findById(connectionId).populate('from_user_id to_user_id');
          const subject = 'New Connection Request';
          const body = `<div style="font-family: Arial, sans-serif; padding: 20px;">
           <h2> Hi ${connection.to_user_id.full_name},</h2>
           <p>You have a new connection request from ${connection.from_user_id.full_name}
           - @${connection.from_user_id.username} </p>
           <p>Click <a href="${process.env.FRONTEND_URL}/connections" style="color:#10b981;">
           here</a> to accept or reject the request</p>
           <br/>
           <p>Thanks, <br/>PingUp - Stay Connected</p>
          </div>`

          await sendEmail({
             to: connection.to_user_id.email,
             subject,
             body
          })
       })

       const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000)
       await step.sleepUntil('wait-for-24-hours', in24Hours);
       await step.run('send-connection-request-reminder', async ()=> {
          const connection = await Connection.findById(connectionId).populate('from_user_id to_user_id');

          if(connection.status === 'accepted'){
             return {message: 'Already accepted'}
          }
          const subject = 'New Connection Request';
          const body = `<div style="font-family: Arial, sans-serif; padding: 20px;">
           <h2> Hi ${connection.to_user_id.full_name},</h2>
           <p>You have a new connection request from ${connection.from_user_id.full_name}
           - @${connection.from_user_id.username} </p>
           <p>Click <a href="${process.env.FRONTEND_URL}/connections" style="color:#10b981;">
           here</a> to accept or reject the request</p>
           <br/>
           <p>Thanks, <br/>PingUp - Stay Connected</p>
          </div>`

          await sendEmail({
             to: connection.to_user_id.email,
             subject,
             body
          })
       })
    }
)
// Create an array where we'll export future Inngest functions
export const functions = [sendNewConnectionRequestReminder];