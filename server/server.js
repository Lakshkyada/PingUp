import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './configs/db.js';
import { connectRedis } from './configs/redis.js';
import userRouter from './routes/userRoutes.js';
import postRouter from './routes/postRoutes.js';
import storyRouter from './routes/storyRoutes.js';
import messageRouter from './routes/messageRoutes.js';
import uploadRouter from './routes/uploadRoutes.js';
import cookieParser from "cookie-parser";
import { inngest, functions } from './inngest/index.js';
import { serve } from "inngest/express";
// console.log('Inngest Functions:', functions);
const app = express();

await connectDB();
await connectRedis();

app.use(express.json());
app.use(cookieParser())

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({ origin: clientUrl, credentials: true }));

// Inngest serve handler
app.use("/api/inngest", serve({ client: inngest, functions }));

app.get('/', (req,res)=> res.send('Server'));
app.use('/api/user', userRouter)
app.use('/api/post', postRouter)
app.use('/api/story', storyRouter)
app.use('/api/message', messageRouter)
app.use('/api/upload', uploadRouter)

const PORT = process.env.PORT || 4000;


app.listen(PORT, ()=> console.log(`Server is running at ${PORT}`));