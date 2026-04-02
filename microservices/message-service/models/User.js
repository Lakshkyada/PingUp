import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: { type: String, default: '' },
    full_name: { type: String, default: '' },
    profile_picture: { type: String, default: '' },
    email: { type: String, default: '' },
}, { timestamps: true, minimize: false });

const User = mongoose.model('User', userSchema);

export default User;