import fs from 'fs'
import imagekit from '../configs/imageKit.js';
import Post from '../models/Post.js';
import User from '../models/User.js';

//Add Post
export const addPost = async (req, res) => {
  const images = req.files || []
  const tempPaths = images.map(img => img.path)

  try {
    const userId = req.user.id;
    const { content, post_type } = req.body

    let image_urls = []

    if (images.length) {
      image_urls = await Promise.all(
        images.map(async (image) => {
          const fileStream = fs.createReadStream(image.path)
          const response = await imagekit.upload({
            file: fileStream,
            fileName: image.originalname,
            folder: "posts"
          })

          const url = imagekit.url({
            path: response.filePath,
            transformation: [
              { quality: "auto" },
              { format: "webp" },
              { width: "512" }
            ]
          })

          return url
        })
      )
    }

    await Post.create({
      user: userId,
      content,
      image_urls,
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
  } finally {

    // remove all temp files
    await Promise.all(
      tempPaths.map(path =>
        fs.promises.unlink(path).catch(() => {})
      )
    )

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

