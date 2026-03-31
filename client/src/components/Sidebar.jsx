import { Circle, CirclePause, CirclePlus, LogOut, SidebarOpen } from 'lucide-react'
import React from 'react'
import { assets, dummyUserData } from '../assets/assets'
import { useNavigate , Link } from 'react-router-dom'
import MenuItems from './MenuItems'
import {useSelector, useDispatch} from 'react-redux'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { setUser } from '../features/user/userSlice'
const Sidebar = ({ sidebarOpen, setSidebarOpen }) => {
    const navigate = useNavigate()
    const user = useSelector((state)=>state.user.value)
    const dispatch = useDispatch()
    const handleLogout = async () => {
        try {
            await api.post('/api/auth/logout')
            localStorage.removeItem('token')
            dispatch(setUser(null))
            navigate('/login')
        } catch (error) {
            toast.error('Logout failed')
        }
    }
  return (    
    <div className={`w-60 xl:w-72 bg-white border-r border-gray-200 flex flex-col justify-between
    items-center max-sm:absolute top-0 bottom-0 z-20 ${
        SidebarOpen ? 'translate-x-0' :'max-sm:-translate-x-full'
    } transition-all-duration-300 ease-in-out`}>
        <div className='w-full'>
             <img src={assets.logo} alt="" className='w-26 ml-7 my-2 cursor-pointer' 
             onClick={()=> navigate('/')}/>
             <hr className='border-gray-300 mb-8'/>

             <MenuItems setSidebarOpen={setSidebarOpen}/>
             <Link to='/create-post' className="flex items-center justify-center gap-2 py-2.5 mt-6 mx-6 rounded-lg  bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-700 hover:to-purple-800 active:scale-95 transition text-white cursor-pointer">
                 <CirclePlus className='w-5 h-5'/>
                 Create Post
             </Link>
        </div>
        <div className='w-full border-t border-gray-200 p-4 px-7 flex items-center justify-between'>
           <div className='flex gap-2 items-center cursor-pointer'>
                <img src={user.profile_picture || assets.default_profile} alt="" className='w-8 h-8 rounded-full' />
                <div>
                    <h1 className='text-sm font-medium'>{user.full_name}</h1>
                    <p className=''>@{user.username}</p>
                </div>
           </div>
           <LogOut className='w-4.5 text-gray-400 hover:text-gray-700 transition cursor-pointer' onClick={handleLogout}/>
        </div>
    </div>
  )
}

export default Sidebar