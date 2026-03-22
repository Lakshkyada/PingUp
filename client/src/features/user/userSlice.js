import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../api/axios.js'
import toast from 'react-hot-toast'
const initialState = {
     value: null
}

export const fetchUser = createAsyncThunk('user/fetchUser', async (user) => {
     console.log("Fetching user:", user);
     return user
})

export const updateUser = createAsyncThunk('user/update', async (userData) => {
     const { data } = await api.post('/api/user/update', userData)
     if(data.success){
         toast.success(data.message)
         return data.user
     } else {
        toast.error(data.message)
        return null
     }
})
const userSlice = createSlice({
     name: 'user',
     initialState,
     reducers: {
         setUser: (state, action) => {
             state.value = action.payload
         }
     },
     extraReducers: (builder) => {
         builder.addCase(fetchUser.fulfilled, (state, action)=>{
             state.value = action.payload
         }).addCase(updateUser.fulfilled, (state, action)=>{
            state.value = action.payload
         })
     }
})

export const { setUser } = userSlice.actions;
export default userSlice.reducer;