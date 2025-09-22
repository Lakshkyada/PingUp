import React, { useEffect, useState } from 'react'
import { dummyMessagesData, dummyRecentMessagesData } from '../assets/assets'
import { Link } from 'react-router-dom'
import moment from 'moment'
const RecentMessages = () => {
    const [messages, setMessages] = useState([])
    const fetchRecentMesages = async ()=>{
         setMessages(dummyRecentMessagesData)
    }
    useEffect(()=>{
        fetchRecentMesages()
    },[])
     //console.log(messages);
  return (
    <div className='space-y-2'>
        {           
            messages.map((message,index)=>(
                <div key={index}>
                  
                 <Link to={`messages/${message.from_user_id._id}`}  key={index} className='flex items-start gap-2 mb-3 py-2 hover:bg-slate-100'>
                       {/* {console.log(message.from_user_id.profile_picture)} */}
                       <img src={message.from_user_id.profile_picture} alt="" className='w-8 h-8 rounded-full'/>
                       <div className='w-full'>
                            <div className='flex justify-between'>
                                <p className='font-medium'>{message.from_user_id.full_name}</p>
                                <p className='text-[10px] text-slate-400'>{moment(message.createdAt).fromNow()}</p>
                            </div>
                            <div className='flex justify-between'>
                                <p className='text-gray-500'>{message.text ? message.text : 'Media'}</p>
                                {!message.seen && <p className='bg-indigo-500 text-white w-4 h-4
                                flex items-center justify-center rounded-full text-[10px]'>1</p>}
                            </div>
                       </div>
                       
                 </Link>
               
                 </div>
            ))
        }
    </div>
  )
}

export default RecentMessages