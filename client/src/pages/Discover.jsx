import React, { useState } from 'react'
import { Search } from 'lucide-react'
import UserCard from '../components/UserCard'
import Loading from '../components/Loading'
import api from '../api/axios'
import toast from 'react-hot-toast'

const normalizeSearchUser = (user) => ({
  ...user,
  _id: user._id ?? user.user_id,
  full_name: user.full_name ?? user.name ?? '',
  followers_count: user.followers_count ?? 0,
})

const Discover = () => {
  const [input, setInput] = useState('')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async (e) => {
    if (e.key !== 'Enter') return

    const query = input.trim()
    if (!query) {
      setUsers([])
      return
    }

    try {
      setLoading(true)
      const { data } = await api.get('/api/search/users', { params: { query } })
      if (data.success) {
        setUsers((data.users || []).map(normalizeSearchUser))
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='min-h-screen bg-linear-to-b from-slate-50 to-white'>
        <div className='max-w-6xl mx-auto p-6'>
            <div className='mb-8'>
              <h1 className='text-3xl font-bold text-slate-900 mb-2'>Discover People</h1>
              <p className='text-slate-600'>Connect with amazing People and grow your network</p>
            </div>
            <div className='mb-8 shadow-md rounded-md border border-slate-200/60 bg-white/80'>
               <div className='p-6'>
                 <div className='relative'>
                   <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5'/>
                   <input
                     type='text'
                     placeholder='Search people by name, username, bio, or location...'
                     className='pl-10 sm:pl-12 py-2 w-full border border-gray-300 rounded-md max-sm:text-sm'
                     onChange={(e) => setInput(e.target.value)}
                     value={input}
                     onKeyUp={handleSearch}
                   />
                 </div>
               </div>
            </div>
            <div className='flex flex-wrap gap-6'>
               {users.map((user) => (
                  <UserCard user={user} key={user._id} />
               ))}
            </div>
            {loading && (<Loading height='60vh'/>)}
        </div>
    </div>
  )
}

export default Discover