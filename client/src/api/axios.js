import axios from 'axios'

const api = axios.create({
     baseURL: import.meta.env.VITE_BASEURL,
     withCredentials: true,
     headers: {
          'Content-Type': 'application/json'
     }
})

// Add token from localStorage to every request as Authorization header
api.interceptors.request.use(
     config => {
          const token = localStorage.getItem('token')
          if (token) {
               config.headers.Authorization = `Bearer ${token}`
          }
          return config
     },
     error => Promise.reject(error)
)

// Only redirect to login for critical auth failures
api.interceptors.response.use(
     response => response,
     error => {
          if (error.response?.status === 401) {
               const path = error.config?.url || ''
               // Only redirect for user profile loading, not for temporary operations like uploads
               const isCriticalEndpoint = path.includes('/api/user/me') || path.includes('user/profile') && !path.includes('imagekit')
               
               if (isCriticalEndpoint && !window.location.pathname.includes('login')) {
                    localStorage.removeItem('token')
                    window.location.href = '/login'
               }
          }
          return Promise.reject(error)
     }
)

export default api