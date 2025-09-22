
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { Buffer } from 'buffer';
window.Buffer = Buffer;

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
//console.log("Clerk key:", PUBLISHABLE_KEY)

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key')
}

//console.log(1);
createRoot(document.getElementById('root')).render(  
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <BrowserRouter>
       <App />
     </BrowserRouter> 
  </ClerkProvider> 
)
