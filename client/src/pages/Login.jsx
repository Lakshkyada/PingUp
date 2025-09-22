import React from 'react'
import {assets} from '../assets/assets'
import {CloudCog, Star} from 'lucide-react'
import "../index.css";
//import {SignIn , useClerk} from '@clerk/clerk-react'
import { SignIn ,useClerk} from "@clerk/clerk-react"   // ✅ correct

//import 'App.css'
const Login = () => {
   
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
                             <Star key={i} className='size-4 md:size-4.5 text-transparent fill -amber-500'/>
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
            <SignIn />
       </div>
    </div>
  )
}

export default Login