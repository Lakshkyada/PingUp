import React, { useState } from 'react'
import {BadgeCheck, MessageCircle, Share, Share2, Heart} from 'lucide-react'
import moment from 'moment'
import { assets, dummyUserData } from '../assets/assets'
import { useNavigate } from 'react-router-dom'
import {useSelector} from 'react-redux'
import api from '../api/axios'
import toast from 'react-hot-toast'
const PostCard = ({post}) => {
    const author = post?.user || null
    const authorId = author?._id || ''
    const authorName = author?.full_name || 'Unknown user'
    const authorUsername = author?.username || 'unknown'
    const authorAvatar = author?.profile_picture || assets.sample_profile || dummyUserData.profile_picture
    const postContent = post?.content || ''
    const imageUrls = Array.isArray(post?.image_urls) ? post.image_urls : []
    const postWithHashtags = postContent.replace(/(#\w+)/g,'<span class="text-indigo-600">$1</span>')
    const [likes, setLikes] = useState(Array.isArray(post?.likes_count) ? post.likes_count.map(id => String(id)) : [])
    const currentUser = useSelector((state)=>state.user.value)
    const currentUserId = String(currentUser?._id || '')
    const handleLike = async ()=>{
          try {
              const {data} = await api.post('/api/post/like', {postId: post._id})
              if(data.success){
                 toast.success(data.message)
                 setLikes(prev=>{
                            if(currentUserId && prev.includes(currentUserId)){
                                return prev.filter(id=>id !== currentUserId)
                     } else {
                                return currentUserId ? [...prev, currentUserId] : prev
                     }
                 })
              } else {
                 console.log("object");
                 toast(data.message)
              }
          } catch (error) {
            toast.error(error.message)
          }
    }
    const navigate = useNavigate()
    const openProfile = () => {
        if (authorId) {
            navigate('/profile/' + authorId)
        }
    }
  return (
    <>
    <div className='bg-white rounded-xl shadow p-4 space-y-4 w-full max-w-2xl'>
        {/* User info */}
        <div onClick={openProfile} className='inline-flex items-center gap-3 cursor-pointer'>
            <img src={authorAvatar} alt="" className='w-10 h-10 rounded-full shadow'/>
            <div>
                <div className='flex items-center space-x-1'>
                    <span>{authorName}</span>
                    <BadgeCheck className='w-4 h-4 text-blue-500' />
                </div>
                <div className='text-gray-500 text-sm'>@{authorUsername} - {moment(post.createdAt).fromNow()}</div>
            </div>
        </div>
        {/* post content */}
        {postContent && <div className='text-gray-800 text-sm whitespace-pre-line' dangerouslySetInnerHTML={{__html: postWithHashtags}}/>}
        {/* images */}
        <div>
             {
                 imageUrls.map((img,index)=>(
                     <img src={img} alt='' key={index} className={`w-full h-48 object-cover rounded-lg ${imageUrls.length===1 && 'col-span-2 h-auto'}`}/>
                ))
             }
        </div>
        {/* Actions */}
        <div className='flex items-baseline-last gap-3 text-gray-600 text-sm pt-2 border-t border-gray-300'>
             <div className='flex items-center gap-1'>
                 <Heart className={`w-4 h-4 cursor-pointer ${currentUserId && likes.includes(currentUserId)
                    && 'text-red-500 fill-red-500'}`} onClick={handleLike}/>
                 <span>{likes.length}</span>
             </div>
             <div className='flex items-center gap-1'>
                 <MessageCircle className='w-4 h-4'/>
                 <span>12</span>
             </div>
             <div className='flex items-center gap-1'>
                 <Share2 className='w-4 h-4'/>
                 <span>7</span>
             </div>
        </div>
    </div>
    </>
  )
}

export default PostCard