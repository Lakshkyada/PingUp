import React, { useEffect, useState } from 'react'
import { assets, dummyPostsData } from '../assets/assets'
import Loading from '../components/Loading'
import StoriesBar from '../components/StoriesBar'
import PostCard from '../components/PostCard'
import RecentMessages from '../components/RecentMessages'
import toast from 'react-hot-toast'
import api from '../api/axios'
import { useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
const Feed = () => {
  const [feeds, setFeeds] = useState([])
  const [loading , setLoading] = useState(true)
  const location = useLocation()
  const currentUser = useSelector((state)=>state.user.value)
  const fetchFeeds = async () => {
        try {
           setLoading(true)
            const {data} = await api.get('/api/post/feed')
           if(data.success){
              setFeeds(data.posts)
           } else {
              toast.error(data.message)
           }
        } catch (error) {
              toast.error(error.message)
        }
        setLoading(false)
  }

  const fetchFeedsWithoutLoader = async () => {
        try {
            const {data} = await api.get('/api/post/feed')
           if(data.success){
              setFeeds(data.posts)
              return data.posts
           }
        } catch {
            // no-op best effort retry path
        }
        return null
  }

  useEffect(()=>{
     fetchFeeds()
     
  },[])

  useEffect(() => {
    if (!location.state?.fromCreatePost || !currentUser?._id) return;

    const optimisticPost = location.state?.optimisticPost;
    if (optimisticPost) {
      setFeeds((prev) => {
        const alreadyAdded = prev.some((post) => post?._id === optimisticPost._id);
        return alreadyAdded ? prev : [optimisticPost, ...prev];
      });
    }

    let cancelled = false;
    const maxAttempts = 5;
    let attempt = 0;

    const pollForOwnPost = async () => {
      while (!cancelled && attempt < maxAttempts) {
        attempt += 1;
        const posts = await fetchFeedsWithoutLoader();
        const hasOwnPost = Array.isArray(posts)
          && posts.some((post) => String(post?.user?._id) === String(currentUser._id));

        if (hasOwnPost) {
          if (optimisticPost) {
            setFeeds((prev) => prev.filter((post) => post?._id !== optimisticPost._id));
          }
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    };

    pollForOwnPost();

    return () => {
      cancelled = true;
    };
  }, [location.state, currentUser?._id]);
  return !loading ? (
    <div className='h-full overflow-y-scroll no-scrollbar py-10 xl:pr-5 flex items-start justify-center xl:gap-8 '>
        {/* stories and post list */}
        
        <div className='p-4 space-y-6'>
           
            <StoriesBar/>
          
            <div className='p-4 space-y-6'>
                {feeds.map((post)=><PostCard key={post._id} post={post}/>)}
            </div>
        </div>
        {/* right side bar */}
        <div className='max-xl:hidden sticky top-0'>
          <div className='max-w-xs bg-white text-xs p-4 rounded-md inline-flex flex-col gap-2 shadow'>
            <h3 className='text-slate-800  font-semibold'>Sponsored</h3>
            <img src={assets.sponsored_img} className='w-75 h-50 rounded-md' alt="sponsored" />
            <p className='text-slate-600'>Email marketing</p>
            <p className='text-slate-400'>Supercharge your marketing with a powerful, easy-to-use platform built for results.</p>
          </div>
          {/* Recent Messages */}
     
          <RecentMessages/>
        </div>
       
    </div>
  ) : <Loading />
}

export default Feed