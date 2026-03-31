import React, { useState } from 'react'
import {assets} from '../assets/assets'
import {Star} from 'lucide-react'
import "../index.css";
import api from '../api/axios'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useDispatch } from 'react-redux'
import { fetchUser } from '../features/user/userSlice'

const Register = () => {
  const dispatch = useDispatch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [full_name, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const navigate = useNavigate()

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!email || !password || !full_name || !username) {
      toast.error('Please fill all fields')
      return
    }
    try {
      const { data } = await api.post('/api/auth/register', { email, password, full_name, username })
      if (data.success) {
        const { data: userData } = await api.get('/api/user/data')
        if (userData.success && userData.user) {
          dispatch(fetchUser(userData.user))
        }
        toast.success('Registration successful! Logging you in...')
        navigate('/')
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      toast.error(error.message || 'Registration failed')
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
            <form onSubmit={handleRegister} className='bg-white p-8 rounded-lg shadow-md w-full max-w-md'>
              <h2 className='text-2xl font-bold mb-6 text-center'>Create Account</h2>
              <div className='mb-4'>
                <label className='block text-gray-700'>Full Name</label>
                <input type='text' value={full_name} onChange={(e) => setFullName(e.target.value)} className='w-full p-2 border border-gray-300 rounded' required />
              </div>
              <div className='mb-4'>
                <label className='block text-gray-700'>Username</label>
                <input type='text' value={username} onChange={(e) => setUsername(e.target.value)} className='w-full p-2 border border-gray-300 rounded' required />
              </div>
              <div className='mb-4'>
                <label className='block text-gray-700'>Email</label>
                <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} className='w-full p-2 border border-gray-300 rounded' required />
              </div>
              <div className='mb-4'>
                <label className='block text-gray-700'>Password</label>
                <input type='password' value={password} onChange={(e) => setPassword(e.target.value)} className='w-full p-2 border border-gray-300 rounded' required />
              </div>
              <button type='submit' className='w-full bg-indigo-600 text-white p-2 rounded font-medium hover:bg-indigo-700'>Create Account</button>
              <p className='text-center mt-4 text-gray-600'>
                Already have an account? <Link to='/login' className='text-indigo-600 hover:underline'>Login</Link>
              </p>
            </form>
       </div>
    </div>
  )
}

export default Register
