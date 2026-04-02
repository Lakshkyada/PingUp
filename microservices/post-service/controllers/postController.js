import Post from "../models/Post.js";
import imagekit from "../configs/imageKit.js";
import { randomUUID } from 'crypto';
import { connectRabbitMq, publishFeedEvent } from '../configs/rabbitmq.js';

const publishPostCreatedEvent = async (eventPayload) => {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      if (attempt > 1) {
        await connectRabbitMq();
      }

      const published = await publishFeedEvent('post.created', eventPayload);
      if (!published) {
        throw new Error('RabbitMQ publish returned false');
      }

      return;
    } catch (error) {
      lastError = error;
      console.error(`Post Service: post.created publish attempt ${attempt} failed:`, error.message);
    }
  }

  throw lastError || new Error('Failed to publish post.created event');
};

// Add Post
export const addPost = async (req, res) => {
  try {
    const userId = req.user.id;
    const { content, post_type, image_urls } = req.body;

    let uploadedImageUrls = [];

    if (image_urls) {
      if (typeof image_urls === 'string') {
        try {
          const parsed = JSON.parse(image_urls);
          uploadedImageUrls = Array.isArray(parsed) ? parsed : [image_urls];
        } catch {
          uploadedImageUrls = [image_urls];
        }
      } else if (Array.isArray(image_urls)) {
        uploadedImageUrls = image_urls;
      }
    }

    const post = await Post.create({
      user: userId,
      content,
      image_urls: uploadedImageUrls,
      post_type
    });

    const postCreatedEvent = {
      event: 'post.created',
      eventId: randomUUID(),
      version: 1,
      occurredAt: new Date().toISOString(),
      postId: post._id.toString(),
      authorId: userId,
      createdAt: post.createdAt,
      contentPreview: content ? String(content).slice(0, 280) : '',
      firstImageUrl: uploadedImageUrls[0] || '',
      postType: post_type || 'text'
    };

    try {
      await publishPostCreatedEvent(postCreatedEvent);
    } catch (eventError) {
      await Post.findByIdAndDelete(post._id);
      return res.status(503).json({
        success: false,
        message: 'Post service event pipeline unavailable. Please try again.'
      });
    }

    res.json({
      success: true,
      message: "Post created successfully"
    });

  } catch (error) {
    console.log(error);
    res.json({
      success: false,
      message: error.message
    });
  }
};

// Like Posts
export const likePosts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { postId } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res.json({ success: false, message: 'Post not found' });
    }

    const alreadyLiked = post.likes_count.some((id) => id.toString() === userId.toString());

    if (alreadyLiked) {
      post.likes_count = post.likes_count.filter((id) => id.toString() !== userId.toString());
      await post.save();

      try {
        await publishFeedEvent('post.unliked', {
          event: 'post.unliked',
          eventId: randomUUID(),
          version: 1,
          occurredAt: new Date().toISOString(),
          postId: post._id.toString(),
          likerId: userId,
        });
      } catch (eventError) {
        console.error('Post Service: Failed to publish post.unliked event:', eventError.message);
      }

      res.json({ success: true, message: 'Post unliked', liked: false });
    } else {
      post.likes_count.push(userId);
      await post.save();

      try {
        await publishFeedEvent('post.liked', {
          event: 'post.liked',
          eventId: randomUUID(),
          version: 1,
          occurredAt: new Date().toISOString(),
          postId: post._id.toString(),
          likerId: userId,
        });
      } catch (eventError) {
        console.error('Post Service: Failed to publish post.liked event:', eventError.message);
      }

      res.json({ success: true, message: 'Post liked', liked: true });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

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

// Get posts for a specific user
export const getPostsByUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const posts = await Post.find({ user: userId })
      .populate('user', 'full_name username profile_picture')
      .sort({ createdAt: -1 });

    res.json({ success: true, posts });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};