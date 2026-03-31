# PingUp Microservices Setup Guide

## Overview
PingUp uses a microservices architecture with the following services:

- **Auth Service** (Port 3002): User authentication and token verification
- **User Service** (Port 3001): User profiles, connections, follow/unfollow
- **Post Service** (Port 3003): Posts, stories, likes
- **Message Service** (Port 3005): Real-time messaging with Socket.io
- **Search Service** (Port 3004): Search users and posts
- **Feed Service** (Port 3006): Personalized home feed reads

## Prerequisites
- Node.js v18+
- MongoDB running locally or remote
- Redis (for user caching)
- ImageKit account (for image uploads)
- SMTP credentials (for emails - Brevo recommended)

## Installation

### 1. Install Dependencies for All Services
```bash
cd microservices/auth-service && npm install
cd ../user-service && npm install
cd ../post-service && npm install
cd ../message-service && npm install
cd ../search-service && npm install
cd ../feed-service && npm install
```

### 2. Environment Configuration

#### auth-service/.env
```
MONGO_URI=mongodb://localhost:27017/pingup
JWT_SECRET=your_jwt_secret_here
AUTH_SERVICE_PORT=3002
```

#### user-service/.env
```
MONGO_URI=mongodb://localhost:27017/pingup
JWT_SECRET=your_jwt_secret_here
USER_SERVICE_PORT=3001
REDIS_URL=redis://127.0.0.1:6379
IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
IMAGEKIT_URL_ENDPOINT=your_imagekit_url_endpoint
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SENDER_EMAIL=your_email@domain.com
FRONTEND_URL=http://localhost:5173
```

#### post-service/.env
```
MONGO_URI=mongodb://localhost:27017/pingup
JWT_SECRET=your_jwt_secret_here
POST_SERVICE_PORT=3003
IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
IMAGEKIT_URL_ENDPOINT=your_imagekit_url_endpoint
FRONTEND_URL=http://localhost:5173
```

#### message-service/.env
```
MONGO_URI=mongodb://localhost:27017/pingup
JWT_SECRET=your_jwt_secret_here
MESSAGE_SERVICE_PORT=3005
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SENDER_EMAIL=your_email@domain.com
FRONTEND_URL=http://localhost:5173
```

#### search-service/.env
```
MONGO_URI=mongodb://localhost:27017/pingup
JWT_SECRET=your_jwt_secret_here
SEARCH_SERVICE_PORT=3004
```

#### feed-service/.env
```
MONGO_URI=mongodb://localhost:27017/pingup
JWT_SECRET=your_jwt_secret_here
FEED_SERVICE_PORT=3006
```

## Running Services

### Development Mode
```bash
# Terminal 1 - Auth Service
cd microservices/auth-service
npm run dev

# Terminal 2 - User Service
cd microservices/user-service
npm run dev

# Terminal 3 - Post Service
cd microservices/post-service
npm run dev

# Terminal 4 - Message Service
cd microservices/message-service
npm run dev

# Terminal 5 - Search Service
cd microservices/search-service
npm run dev

# Terminal 6 - Feed Service
cd microservices/feed-service
npm run dev
```

### Production Mode
```bash
npm start
```

## Service Architecture

### Auth Service
- **Register**: POST `/api/auth/register`
- **Login**: POST `/api/auth/login`
- **Verify Token**: GET `/api/auth/verify`

### User Service
- **Get User Data**: GET `/api/users/me` (Protected)
- **Update User**: PUT `/api/users/update` (Protected)
- **Discover Users**: POST `/api/users/discover` (Protected)
- **Follow User**: POST `/api/users/follow` (Protected)
- **Unfollow User**: POST `/api/users/unfollow` (Protected)
- **Send Connection Request**: POST `/api/users/connect` (Protected)
- **Get Connections**: GET `/api/users/connections` (Protected)
- **Accept Connection**: POST `/api/users/accept-connection` (Protected)
- **Get User Profile**: POST `/api/users/profile` (Protected)
- **ImageKit Auth**: GET `/api/users/imagekit-auth` (Protected)

### Post Service
- **Create Post**: POST `/api/posts` (Protected)
- **Like Post**: POST `/api/posts/like` (Protected)
- **ImageKit Auth**: GET `/api/posts/imagekit-auth` (Protected)
- **Add Story**: POST `/api/stories` (Protected)
- **Get Stories**: GET `/api/stories` (Protected)

### Feed Service
- **Get Feed Posts**: GET `/api/feed/posts` (Protected)

### Message Service
- **Send Message**: POST `/api/messages` (Protected)
- **Get Chat Messages**: GET `/api/messages/chat/:userId` (Protected)
- **Get Recent Messages**: GET `/api/messages/recent` (Protected)
- **Socket.io**: Real-time message updates

### Search Service
- **Search Users**: GET `/api/search/users?query=...` (Protected)
- **Search Posts**: GET `/api/search/posts?query=...` (Protected)
- **Global Search**: GET `/api/search?query=...` (Protected)

## Background Jobs (Inngest)

### User Service
- **Connection Request Reminder**: Sends email on request, reminder after 24 hours

### Post Service
- **Delete Story**: Automatically deletes story after 24 hours

### Message Service
- **Unseen Messages Notification**: Daily cron job (9 AM) to notify of unseen messages

## Database Models

### User Schema
```javascript
{
  email: String (unique),
  password: String (hashed),
  full_name: String,
  username: String (unique),
  bio: String,
  profile_picture: String,
  cover_photo: String,
  location: String,
  followers: [ObjectId],
  following: [ObjectId],
  connections: [ObjectId],
  timestamps: true
}
```

### Post Schema
```javascript
{
  user: ObjectId,
  content: String,
  image_urls: [String],
  post_type: enum['text', 'image', 'text_with_image'],
  likes_count: [ObjectId],
  timestamps: true
}
```

### Story Schema
```javascript
{
  user: ObjectId,
  content: String,
  media_url: String,
  media_type: enum['text', 'image', 'video'],
  views_count: [ObjectId],
  background_color: String,
  timestamps: true
}
```

### Message Schema
```javascript
{
  from_user_id: ObjectId,
  to_user_id: ObjectId,
  text: String,
  message_type: enum['text', 'image'],
  media_url: String,
  seen: Boolean,
  timestamps: true
}
```

### Connection Schema
```javascript
{
  from_user_id: ObjectId,
  to_user_id: ObjectId,
  status: enum['pending', 'accepted'],
  timestamps: true
}
```

## Features

### Image Uploads
- All services support ImageKit integration for image storage
- Direct client-to-ImageKit uploads with signed auth parameters
- Automatic image transformation and optimization

### Email Notifications
- Connection requests with follow-up reminders (24 hours)
- Unseen message notifications (daily at 9 AM)
- SMTP configured for Brevo/Sendinblue

### Real-time Messaging
- Socket.io integration in message service
- Real-time message delivery and typing indicators
- Connection status tracking

### Caching
- Redis integration in user service for profile caching
- 5-minute TTL on user data to reduce DB queries

## Error Handling

All services include:
- Try-catch error handling in controllers
- Graceful shutdown handlers
- MongoDB connection error tracking
- Proper HTTP status codes

## Security

- JWT token-based authentication
- Bearer token validation
- Password hashing with bcryptjs
- CORS configured for microservices
- Input validation in controllers

## Troubleshooting

### Service Won't Start
1. Check if port is already in use
2. Verify MongoDB connection string
3. Ensure all dependencies are installed
4. Check .env file for required variables

### Authentication Failing
1. Verify JWT_SECRET is consistent across all services
2. Check token format (Bearer token)
3. Ensure user exists in database

### ImageKit Upload Issues
1. Verify ImageKit credentials in .env
2. Check URL endpoint configuration
3. Verify public/private key permissions

## Development Notes

- All services use ES modules (`"type": "module"` in package.json)
- Nodemon configured for auto-restart during development
- MongoDB connection uses mongoose ODM
- Inngest for background job scheduling

## Next Steps

1. Set up Inngest account for production background jobs
2. Configure MongoDB Atlas for production
3. Set up Redis Cloud for caching
4. Test all microservices endpoints
5. Implement API Gateway (optional but recommended)


step 

start nginx using 
nginx command
nginx -t for test
nginx -s reload when we change config file

strat redis server 
using redis-server -> persistance data stoage
      redis-server --save "" -> no persistance 

open 7 terminal 
one for client and one for evry microservices start
