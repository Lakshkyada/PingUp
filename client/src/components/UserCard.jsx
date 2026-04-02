import React, { useState, useEffect } from 'react'
import { MapPin, MessageCircle, Plus, UserPlus } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { fetchUser } from '../features/user/userSlice'

const UserCard = ({ user }) => {
     const currentUser = useSelector((state) => state.user.value)
     const dispatch = useDispatch()
     const navigate = useNavigate()
     const [isFollowing, setIsFollowing] = useState(false)

     const userId = user?._id ?? user?.user_id
     const displayName = user?.full_name ?? user?.name ?? ''
     const followerCount = typeof user?.followers_count === 'number'
         ? user.followers_count
         : Array.isArray(user?.followers)
             ? user.followers.length
             : 0

     const isOwner = currentUser?._id === userId

     useEffect(() => {
         setIsFollowing(Array.isArray(currentUser?.following) && currentUser.following.includes(userId))
     }, [currentUser, userId])

     const syncUserState = async () => {
         try {
             const result = await api.get('/api/user/data')
             if (result.data.success) {
                 dispatch(fetchUser(result.data.user))
             }
         } catch (error) {
             console.error('Failed to sync user state:', error)
         }
     }

     const handleFollow = async () => {
         if (isOwner) {
             toast.error('You cannot follow yourself')
             return
         }
         try {
             const endpoint = isFollowing ? '/api/user/unfollow' : '/api/user/follow'
             const { data } = await api.post(endpoint, { id: userId })
             if (data.success) {
                 toast.success(data.message)
                 setIsFollowing(!isFollowing)
                 await syncUserState()
             } else {
                 toast.error(data.message)
             }
         } catch (error) {
             toast.error(error.message)
         }
     }

     const handleConnectionRequest = async () => {
         if (currentUser.connections?.includes(userId)) {
             return navigate('/messages/' + userId)
         }
         try {
             const { data } = await api.post('/api/user/connect', { id: userId })
             if (data.success) {
                 toast.success(data.message)
                 await syncUserState()
             } else {
                 toast.error(data.message)
             }
         } catch (error) {
             toast.error(error.message)
         }
     }

  return (
    <div key={userId} className='p-4 pt-6 flex flex-col justify-between w-72 shadow border border-gray-200 rounded-md'>
        <div className='text-center'>
            <img src={user.profile_picture} alt="" className='rounded-full w-16 shadow-md mx-auto'/>
            <p className='mt-4 font-semibold'>{displayName}</p>
            {user.username && <p className='text-gray-500 font-light'>@{user.username}</p>}
            {user.bio && <p className='text-gray-600 mt-2 text-center text-sm px-4'>{user.bio}</p>}
        </div>
        <div className='flex items-center justify-center gap-2 mt-4 text-xs text-gray-600 '>
            <div className='flex items-center gap-1 border border-gray-300 rounded-full px-3 py-1'>
                 <MapPin className='w-4 h-4'/> {user.location || ''}
            </div>
            <div className='flex items-center gap-1 border border-gray-300 rounded-full px-3 py-1'>
                <span>{followerCount}</span> Followers
            </div>
        </div>
        <div className='flex mt-4 gap-2'>
             <button
                onClick={handleFollow}
                disabled={isOwner}
                className={`w-full py-2 rounded-md flex justify-center items-center gap-2 bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-95 transition text-white ${isOwner ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <UserPlus className='w-4 h-4'/>
                {isOwner ? 'Your Profile' : (isFollowing ? 'Unfollow' : 'Follow')}
             </button>
             <button onClick={handleConnectionRequest} className='flex items-center justify-center w-16 border text-slate-500 group rounded-md cursor-pointer active:scale-95 transition'>
                  {
                     Array.isArray(currentUser?.connections) && currentUser.connections.includes(userId) ?
                     <MessageCircle className='w-5 h-5 group-hover:scale-105 transition'/>
                     :
                     <Plus className='w-5 h-5 group-hover:scale-105 transition'/>
                  }
             </button>
        </div>
    </div>
  )
}

export default UserCard