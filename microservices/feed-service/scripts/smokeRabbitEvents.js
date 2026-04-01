import 'dotenv/config';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import User from '../models/User.js';
import Post from '../models/Post.js';
import ProcessedEvent from '../models/ProcessedEvent.js';
import {
  FEED_EXCHANGE,
  POST_EVENTS_QUEUE,
  USER_EVENTS_QUEUE,
  connectRabbitMq,
  getRabbitMqChannel,
  closeRabbitMqConnection
} from '../configs/rabbitmq.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForProcessed = async (eventIds, timeoutMs = 15000) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const found = await ProcessedEvent.find({ eventId: { $in: eventIds } }).select('eventId').lean();
    const foundIds = new Set(found.map((item) => item.eventId));
    if (eventIds.every((id) => foundIds.has(id))) {
      return true;
    }
    await sleep(500);
  }

  return false;
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  let author = await User.findOne().lean();
  if (!author) {
    const created = await User.create({ full_name: 'Smoke Author', username: `smoke_author_${Date.now()}` });
    author = created.toObject();
  }

  let follower = await User.findOne({ _id: { $ne: author._id } }).lean();
  if (!follower) {
    const created = await User.create({ full_name: 'Smoke Follower', username: `smoke_follower_${Date.now()}` });
    follower = created.toObject();
  }

  const postId = new mongoose.Types.ObjectId().toString();
  const postEventId = `smoke-post-${randomUUID()}`;
  const userEventId = `smoke-user-${randomUUID()}`;

  await connectRabbitMq();
  const channel = getRabbitMqChannel();

  const beforeQueues = {
    post: await channel.checkQueue(POST_EVENTS_QUEUE),
    user: await channel.checkQueue(USER_EVENTS_QUEUE)
  };

  channel.publish(
    FEED_EXCHANGE,
    'post.created',
    Buffer.from(JSON.stringify({
      event: 'post.created',
      eventId: postEventId,
      version: 1,
      occurredAt: new Date().toISOString(),
      postId,
      authorId: author._id.toString(),
      createdAt: new Date().toISOString(),
      contentPreview: 'Smoke test post',
      firstImageUrl: '',
      postType: 'text'
    })),
    { persistent: true, contentType: 'application/json' }
  );

  channel.publish(
    FEED_EXCHANGE,
    'user.followed',
    Buffer.from(JSON.stringify({
      event: 'user.followed',
      eventId: userEventId,
      version: 1,
      occurredAt: new Date().toISOString(),
      followerId: follower._id.toString(),
      followingId: author._id.toString()
    })),
    { persistent: true, contentType: 'application/json' }
  );

  const consumed = await waitForProcessed([postEventId, userEventId]);

  const mirroredPost = await Post.findById(postId).lean();
  const refreshedFollower = await User.findById(follower._id).lean();
  const refreshedAuthor = await User.findById(author._id).lean();

  const afterQueues = {
    post: await channel.checkQueue(POST_EVENTS_QUEUE),
    user: await channel.checkQueue(USER_EVENTS_QUEUE)
  };

  const summary = {
    produced: true,
    consumed,
    checks: {
      processedEventsFound: consumed,
      postMirrored: Boolean(mirroredPost),
      followerUpdated: refreshedFollower?.following?.some((id) => id.toString() === author._id.toString()) || false,
      authorFollowersUpdated: refreshedAuthor?.followers?.some((id) => id.toString() === follower._id.toString()) || false
    },
    queueReadyBefore: {
      post: beforeQueues.post.messageCount,
      user: beforeQueues.user.messageCount
    },
    queueReadyAfter: {
      post: afterQueues.post.messageCount,
      user: afterQueues.user.messageCount
    },
    ids: {
      authorId: author._id.toString(),
      followerId: follower._id.toString(),
      postId,
      postEventId,
      userEventId
    }
  };

  console.log(JSON.stringify(summary, null, 2));

  await closeRabbitMqConnection();
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Smoke test failed:', error.message);
  await closeRabbitMqConnection();
  await mongoose.disconnect();
  process.exit(1);
});
