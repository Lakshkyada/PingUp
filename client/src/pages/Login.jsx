import React, { useState } from 'react'
import {assets} from '../assets/assets'
import {CloudCog, Star} from 'lucide-react'
import "../index.css";
import api from '../api/axios'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useDispatch } from 'react-redux'
import { fetchUser } from '../features/user/userSlice'

const Login = () => {
  const dispatch = useDispatch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const { data } = await api.post('/api/auth/login', { email, password })
      if (data.success) {
        // Store token in localStorage so axios interceptor can use it
        if (data.token) {
          localStorage.setItem('token', data.token)
        }
        if (data.user) {
          dispatch(fetchUser(data.user))
        }
        const { data: userData } = await api.get('/api/users/me')
        if (userData.success && userData.user) {
          dispatch(fetchUser(userData.user))
          toast.success('Login successful')
          navigate('/')
        } else {
          toast.error(userData.message || 'Unable to load user profile')
        }
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className='min-h-screen flex flex-col md:flex-row'>
       {/* bgImage */}
       <img src={assets.bgImage} alt='frf' className='absolute top-0 left-0 -z-1 w-full h-screen
       h-full object-cover'/>
       {/* left-side */}
       <div className='flex-1 flex flex-col items-start justify-between p-6 md:p-10 lg:pl-40 '>
          <span className='md:h-10'></span>
          <img alt='' src={assets.logo} className='h-12 object-contain'/>
          <div>
             <div className='ml-10 flex items-center gap-3 mb-4 max-md:mt-10'>
                <img src={assets.group_users} alt="" className='h-8 md:h-10'/>
                <div>
                   <div className='flex'>
                     {
                         Array(5).fill(0).map((_,i)=>(
                             <Star key={i} className='size-4 md:size-4.5 fill-amber-500 text-amber-500'/>
                         ))
                     }
                    </div>
                    <p>Used By 12k+ users</p>
                </div>               
             </div>
              <h5 className='text-3xl md:text-6xl md:pb-2 font-bold bg-gradient-to-r from-indigo-950 to-indigo-800 bg-clip-text text-transparent'>
                  More than just friends truly connect
              </h5>
                <p className='text-xl md:text-3xl text-indigo-900 max-w-72 md:max-w-md'> connect with global community on pingup. </p>
          </div>
          <span className='md:h-10'></span>
       </div>
       {/* right-side */}
       <div className='flex-1 flex items-center justify-center p-6 sm:p-10'>
            <form onSubmit={handleLogin} className='bg-white p-8 rounded-lg shadow-md w-full max-w-md'>
              <h2 className='text-2xl font-bold mb-6 text-center'>Login</h2>
              <div className='mb-4'>
                <label className='block text-gray-700'>Email</label>
                <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} className='w-full p-2 border border-gray-300 rounded' required />
              </div>
              <div className='mb-4'>
                <label className='block text-gray-700'>Password</label>
                <input type='password' value={password} onChange={(e) => setPassword(e.target.value)} className='w-full p-2 border border-gray-300 rounded' required />
              </div>
              <button type='submit' className='w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600'>Login</button>
              <p className='text-center mt-4 text-gray-600'>
                Don't have an account? <Link to='/register' className='text-blue-500 hover:underline'>Sign up</Link>
              </p>
            </form>
       </div>
    </div>
  )
}

export default Login