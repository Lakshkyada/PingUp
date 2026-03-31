import { Inngest } from "inngest";
import Story from "../models/Story.js";
// Create a client to send and receive events
export const inngest = new Inngest({ id: "pingup-app", isDev: true  });



// Inngest Function to delete story after 24 hours
const deleteStory = inngest.createFunction(
   {
      id: 'story-delete',
      triggers: { event: 'app/story.delete' }
   },
     async ({ event, step}) => {
        const { storyId } = event.data;
        const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000)
        await step.sleepUntil('wait-for-24-hours', in24Hours)
        await step.run('delete-story', async () => {
              await Story.findByIdAndDelete(storyId)
              return { message: 'Story deleted.'}
        })
     }
 )

// Create an array where we'll export future Inngest functions
export const functions = [deleteStory];