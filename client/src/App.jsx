import { useRef } from 'react'
import { Route, Routes, useLocation, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Feed from './pages/Feed'
import Messages from './pages/Messages'
import ChatBox from './pages/ChatBox'
import Profile from './pages/Profile'
import CreatePost from './pages/CreatePost'
import Discover from './pages/Discover'
import Connections from './pages/Connections'
import Layout from './pages/Layout'
import toast, {Toaster} from 'react-hot-toast'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchUser } from './features/user/userSlice'
import { fetchConnections } from './features/connections/connectionsSlice'
import { addMessage } from './features/messages/messagesSlice'
import Notification from './components/Notification'
import api from './api/axios'


const App = () => {
  const dispatch = useDispatch()
  const {pathname} = useLocation()
  const pathnameRef = useRef(pathname)
  const currentUser = useSelector((state) => state.user.value)
  // console.log("App user:", pathnameRef.current);
  useEffect(()=>{
    const fetchData = async () => {
     try {
       const { data } = await api.get('/api/user/data')
       if (data.success) {
         dispatch(fetchUser(data.user))
         dispatch(fetchConnections())
       }
     } catch (error) {
       // User not logged in
     }
    }
     fetchData()
  },[dispatch])

  useEffect(()=>{
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(()=>{
      if(currentUser){
         const baseUrl = import.meta.env.VITE_BASEURL?.trim() || window.location.origin;
         const sseUrl = `${baseUrl.replace(/\/$/, '')}/api/messages/sse/${currentUser._id}`;
         const eventSource = new EventSource(sseUrl);

         eventSource.onopen = () => {
           console.log('SSE connected to', sseUrl);
         };

         eventSource.onerror = (error) => {
           console.error('SSE error:', error);
         };

         eventSource.onmessage = (event)=>{
           const message = JSON.parse(event.data);
           if(pathnameRef.current === (`/messages/${message.from_user_id._id}`)){
              dispatch(addMessage(message));
           } else {
              toast.custom((t)=>(
                 <Notification t={t} message={message}/>
              ), {position: 'bottom-right'});
           }
         };

         return ()=>{
            eventSource.close();
         };
      }
  }, [currentUser, dispatch])
  return (
    <>      
        <Toaster/> 
        <Routes>
          <Route path='/login' element={!currentUser ? <Login/> : <Navigate to="/" replace />}/>
          <Route path='/register' element={!currentUser ? <Register/> : <Navigate to="/" replace />}/>
          <Route path='/' element={currentUser ? <Layout/> : <Navigate to="/login" replace />}> 
            <Route index element={<Feed/>}/>   
            <Route path='messages' element={<Messages />}/> 
            <Route path='messages/:userId' element={<ChatBox/>}/>
            <Route path='connections' element={<Connections />}/> 
            <Route path='discover' element={<Discover/>}/>    
            <Route path='profile' element={<Profile/>}/>
            <Route path='profile/:profileId' element={<Profile/>}/>
            <Route path='create-post' element={<CreatePost/>}/>
          </Route>        
        </Routes>
    </>
  )
}

export default App