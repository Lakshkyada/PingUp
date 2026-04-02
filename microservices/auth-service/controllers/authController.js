import User from "../models/User.js";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { publishFeedEvent } from '../configs/rabbitmq.js';

const publishUserEvent = async (routingKey, payload) => {
    try {
        const event = {
            event: routingKey,
            eventId: randomUUID(),
            version: 1,
            occurredAt: new Date().toISOString(),
            ...payload,
        };

        await publishFeedEvent(routingKey, event);
        console.log(`Auth Service: Published ${routingKey} event`, { eventId: event.eventId });
    } catch (eventError) {
        console.error(`Auth Service: Failed to publish ${routingKey}:`, eventError.message);
    }
};

const setAuthCookie = (res, token) => {
    res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; SameSite=Lax`);
};

const getRequestToken = (req) => {
    const headerToken = req.header('Authorization')?.replace('Bearer ', '');
    const cookieToken = req.headers.cookie
        ?.split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith('token='))
        ?.split('=')[1];

    return headerToken || cookieToken;
};

// Register User
export const registerUser = async (req, res) => {
    try {
        const { email, password, username, full_name } = req.body;
        console.log('Registration attempt:', req.body);
        const normalizedEmail = email?.trim().toLowerCase();
        const normalizedUsername = username?.trim();
 
        if (!normalizedEmail || !password || !normalizedUsername || !full_name?.trim()) {
            return res.json({ success: false, message: 'All fields are required' });
        }

        const existingUser = await User.findOne({
            $or: [{ email: normalizedEmail }, { username: normalizedUsername }]
        });
        console.log('Checking existing user:', { email: normalizedEmail, username: normalizedUsername }, existingUser);
        console.log('Registration attempt:', { email: normalizedEmail, username: normalizedUsername });
        if (existingUser) {
            return res.json({ success: false, message: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            email: normalizedEmail,
            password: hashedPassword,
            username: normalizedUsername,
            full_name: full_name.trim()
        });
        await user.save();

        await publishUserEvent('user.created', {
            user: {
                user_id: user._id.toString(),
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                bio: user.bio || '',
                location: user.location || '',
                profile_picture: user.profile_picture || '',
                followers_count: Array.isArray(user.followers) ? user.followers.length : 0,
                created_at: user.createdAt,
            },
        });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        console.log('Generated token:', token);
        setAuthCookie(res, token);
        console.log('User registered successfully:', { id: user._id, email: user.email, username: user.username });
        res.json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                full_name: user.full_name
            }
        });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Login User
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login attempt:', req.body);
        const identifier = email?.trim();
        console.log('Login attempt:', email);
        if (!identifier || !password) {
            return res.json({ success: false, message: 'Email/username and password are required' });
        }

        // Backward compatible: allow login using either email or username.
        const user = await User.findOne({email: identifier.toLowerCase()});
        console.log('Login attempt:', user);
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        setAuthCookie(res, token);
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                full_name: user.full_name
            }
        });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Logout User
export const logoutUser = async (req, res) => {
    try {
        res.setHeader('Set-Cookie', 'token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
        res.json({ success: true, message: 'Logout successful' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Verify Token (for other services to check)
export const verifyToken = async (req, res) => {
    try {
        const token = getRequestToken(req);
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, user });
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};