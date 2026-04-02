import User from '../models/User.js';
import { getRabbitMqChannel } from '../configs/rabbitmq.js';

const USER_EVENTS_QUEUE = 'user-service.user-events';

let consumerTag = null;

const normalizeEventType = (value) => String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '_');

const normalizeUserDocument = (payload = {}, existingDocument = {}) => {
    const userId = payload.user_id ?? payload.userId ?? payload.id ?? payload._id ?? existingDocument._id;
    const fullName = payload.full_name ?? payload.fullName ?? payload.name ?? existingDocument.full_name ?? existingDocument.name ?? '';

    return {
        _id: userId,
        username: payload.username ?? existingDocument.username ?? '',
        email: payload.email ?? existingDocument.email ?? '',
        full_name: fullName,
        bio: payload.bio ?? existingDocument.bio ?? '',
        location: payload.location ?? existingDocument.location ?? '',
        profile_picture: payload.profile_picture ?? payload.profilePicture ?? existingDocument.profile_picture ?? '',
        followers_count: Number(payload.followers_count ?? payload.followersCount ?? existingDocument.followers_count ?? 0),
        createdAt: payload.created_at ?? payload.createdAt ?? existingDocument.createdAt ?? new Date(),
    };
};

const indexUserDocument = async (payload, eventType) => {
    const candidateUserId = payload.user_id ?? payload.userId ?? payload.id ?? payload._id;
    if (!candidateUserId) {
        throw new Error('User Service: Missing user_id in user event payload');
    }

    const existingUser = await User.findById(candidateUserId);
    const userDocument = normalizeUserDocument(payload, existingUser ?? {});

    if (eventType === 'USER_UPDATED' && existingUser) {
        userDocument.createdAt = existingUser.createdAt ?? userDocument.createdAt;
    }

    await User.findByIdAndUpdate(candidateUserId, userDocument, {
        upsert: true,
        new: true,
    });
};

const processUserEvent = async (message) => {
    const rawPayload = message?.content ? JSON.parse(message.content.toString()) : message;
    const eventType = normalizeEventType(
        rawPayload?.event
        ?? rawPayload?.type
        ?? rawPayload?.eventType
        ?? message?.fields?.routingKey
    );

    if (!['USER_CREATED', 'USER_UPDATED'].includes(eventType)) {
        console.log('User Service: Ignored non-indexable user event', {
            eventType,
            routingKey: message?.fields?.routingKey,
        });
        return true;
    }

    const payload = rawPayload?.user ?? rawPayload?.data?.user ?? rawPayload?.data ?? rawPayload;
    await indexUserDocument(payload, eventType);
    console.log('User Service: Synced user event to database', {
        eventType,
        user_id: payload?.user_id ?? payload?.id ?? payload?._id,
        username: payload?.username,
        routingKey: message?.fields?.routingKey,
    });
    return true;
};

export const startUserEventConsumer = async () => {
    try {
        const channel = getRabbitMqChannel();
        if (!channel) {
            console.error('User Service: RabbitMQ channel not available');
            return;
        }

        const FEED_EXCHANGE = 'feed.events';
        await channel.assertExchange(FEED_EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(USER_EVENTS_QUEUE, { durable: true });
        await channel.bindQueue(USER_EVENTS_QUEUE, FEED_EXCHANGE, 'user.*');
        await channel.prefetch(20);

        const queueState = await channel.checkQueue(USER_EVENTS_QUEUE);
        console.log('User Service: user events queue ready', {
            queue: USER_EVENTS_QUEUE,
            messages: queueState.messageCount,
            consumers: queueState.consumerCount,
        });

        const consumer = await channel.consume(USER_EVENTS_QUEUE, async (message) => {
            if (!message) {
                return;
            }

            try {
                await processUserEvent(message);
                channel.ack(message);
            } catch (error) {
                console.error('User Service: Failed to process user event:', error.message);
                channel.nack(message, false, false);
            }
        }, { noAck: false });

        consumerTag = consumer.consumerTag;
    } catch (error) {
        console.error('User Service: Failed to start user event consumer:', error.message);
    }
};

export const stopUserEventConsumer = async () => {
    try {
        const channel = getRabbitMqChannel();
        if (channel && consumerTag) {
            await channel.cancel(consumerTag);
            console.log('User Service: user event consumer stopped');
        }
    } catch (error) {
        console.error('User Service: Failed to stop user event consumer:', error.message);
    }

    consumerTag = null;
};
