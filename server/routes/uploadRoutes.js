import express from "express";
import authMiddleware from "../middlewares/auth.js";
import { getImageKitAuth } from "../controllers/uploadController.js";

const uploadRouter = express.Router();

uploadRouter.get("/imagekit-auth", authMiddleware, getImageKitAuth);

export default uploadRouter;
