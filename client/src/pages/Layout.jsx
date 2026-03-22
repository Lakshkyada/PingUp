import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import {Menu , X} from 'lucide-react'
import { dummyUserData } from '../assets/assets'
import Loding from '../components/Loading'
import Sidebar from '../components/Sidebar'
import {useSelector} from 'react-redux'

const Layout = () => {
   //console.log("heloo");  
   const user = useSelector((state)=>state.user.value)
   const [sidebarOpen , setSidebarOpen] = useState(false);
  return user ? (
    <div className='w-full flex h-screen relative'>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}/>
      <div className='flex-1 bg-slate-50'>
         <Outlet />
      </div>
      {
         sidebarOpen ?
         <X className='absolute top-3 right-3 p-2 z-50 bg-white rounded-md shadow w-10 h-10 text-gray-600' onClick={()=>setSidebarOpen(false)}/>
         :
         <Menu className='absolute top-3 right-3 p-2 z-50 bg-white rounded-md shadow w-10 h-10 text-gray-600' onClick={()=>setSidebarOpen(true)}/>
      }
    </div>
  ) : <Loding/>
}

export default Layout