
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import  {Buffer}  from 'buffer';
import { Provider } from 'react-redux'
import { store } from './app/store.js'
window.Buffer = Buffer;

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
//console.log("Clerk key:", PUBLISHABLE_KEY)

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key')
}

//console.log(1);
createRoot(document.getElementById('root')).render( 
  <Provider store={store}>
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <BrowserRouter>
      
        <App />
      
     </BrowserRouter> 
  </ClerkProvider> 
  </Provider>      
)
