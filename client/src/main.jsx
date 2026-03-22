
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import  {Buffer}  from 'buffer';
import { Provider } from 'react-redux'
import { store } from './app/store.js'
window.Buffer = Buffer;

//console.log(1);
createRoot(document.getElementById('root')).render(
  <Provider store={store}>
    <BrowserRouter>
        <App />
     </BrowserRouter>
  </Provider>
)
