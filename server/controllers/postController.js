import Post from '../models/Post.js';
import User from '../models/User.js';
import imagekit from '../configs/imageKit.js';

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

const getTransformedImageUrl = (inputUrl) => {
  const path = getImageKitPathFromUrl(inputUrl);
  if (!path) return inputUrl;

  return imagekit.url({
    path,
    transformation: [
      { quality: 'auto' },
      { format: 'webp' },
      { width: '512' },
    ],
  });
};

//Add Post
export const addPost = async (req, res) => {
  try {
    const userId = req.user.id;
    const { content, post_type } = req.body
    let { image_urls } = req.body

    let uploadedImageUrls = []

    if (image_urls) {
      if (typeof image_urls === 'string') {
        try {
          const parsed = JSON.parse(image_urls)
          uploadedImageUrls = Array.isArray(parsed) ? parsed : [image_urls]
        } catch {
          uploadedImageUrls = [image_urls]
        }
      } else if (Array.isArray(image_urls)) {
        uploadedImageUrls = image_urls
      }
    }

    const transformedImageUrls = uploadedImageUrls.map((url) =>
      getTransformedImageUrl(url)
    );

    await Post.create({
      user: userId,
      content,
      image_urls: transformedImageUrls,
      post_type
    })

    res.json({
      success: true,
      message: "Post created successfully"
    })

  } catch (error) {
    console.log(error)
    res.json({
      success: false,
      message: error.message
    })
  }
}

// Get Posts
export const getFeedPosts = async (req, res) => {
     try {
         const userId = req.user.id;
         const user = await User.findById(userId)

         // User connections and following
         const userIds = [userId, ...(user.connections || []), ...(user.following || [])]
         const posts = await Post.find({user: {$in: userIds}}).populate('user').sort({createdAt: -1})
         res.json({success: true, posts})
    } catch (error) {
         console.log(error);
         res.json({success: false, message: error.message})
     }
}

// Like Posts
export const likePosts = async (req, res) => {
     try {
         const userId = req.user.id;
         const {postId} = req.body

         const post = await Post.findById(postId)
         if(post.likes_count.includes(userId)){
            post.likes_count = post.likes_count.filter(user => user !== userId)
            await post.save()
            res.json({success: true, message: 'Post unliked'});
         }
         else{
             post.likes_count.push(userId)
             await post.save()
             res.json({success: true, message: 'Post liked'})
         }
    } catch (error) {
         console.log(error);
         res.json({success: false, message: error.message})
     }
}

