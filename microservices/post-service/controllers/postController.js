import Post from "../models/Post.js";
import imagekit from "../configs/imageKit.js";

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

    await Post.create({
      user: userId,
      content,
      image_urls: uploadedImageUrls,
      post_type
    });

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
    if (post.likes_count.includes(userId)) {
      post.likes_count = post.likes_count.filter(user => user !== userId);
      await post.save();
      res.json({ success: true, message: 'Post unliked' });
    } else {
      post.likes_count.push(userId);
      await post.save();
      res.json({ success: true, message: 'Post liked' });
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