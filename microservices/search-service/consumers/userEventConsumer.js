import client, { USER_INDEX, ensureUsersIndex } from '../configs/elasticsearch.js';
import { connectRabbitMq, getRabbitMqChannel } from '../configs/rabbitmq.js';

const USER_EVENTS_EXCHANGE = 'feed.events';
const USER_EVENTS_QUEUE = 'search.user-events';

let consumerTag = null;

const normalizeEventType = (value) => String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '_');

const normalizeUserDocument = (payload = {}, existingDocument = {}) => {
    const userId = payload.user_id ?? payload.userId ?? payload.id ?? payload._id ?? existingDocument.user_id;
    const fullName = payload.full_name ?? payload.fullName ?? payload.name ?? existingDocument.full_name ?? existingDocument.name ?? '';

    return {
        user_id: userId,
        username: payload.username ?? existingDocument.username ?? '',
        email: payload.email ?? existingDocument.email ?? '',
        full_name: fullName,
        bio: payload.bio ?? existingDocument.bio ?? '',
        location: payload.location ?? existingDocument.location ?? '',
        profile_picture: payload.profile_picture ?? payload.profilePicture ?? existingDocument.profile_picture ?? '',
        followers_count: Number(payload.followers_count ?? payload.followersCount ?? existingDocument.followers_count ?? 0),
        created_at: payload.created_at ?? payload.createdAt ?? existingDocument.created_at ?? new Date().toISOString(),
    };
};

const getExistingUser = async (userId) => {
    try {
        const response = await client.get({ index: USER_INDEX, id: userId });
        return response?._source ?? response?.body?._source ?? null;
    } catch (error) {
        if (error?.meta?.statusCode === 404) {
            return null;
        }

        throw error;
    }
};

const indexUserDocument = async (payload, eventType) => {
    const candidateUserId = payload.user_id ?? payload.userId ?? payload.id ?? payload._id;
    const existingDocument = candidateUserId ? await getExistingUser(candidateUserId) : null;
    const userDocument = normalizeUserDocument(payload, existingDocument ?? {});

    if (!userDocument.user_id) {
        throw new Error('Search Service: Missing user_id in user event payload');
    }

    if (eventType === 'USER_UPDATED' && existingDocument) {
        userDocument.created_at = existingDocument.created_at ?? userDocument.created_at;
    }

    await client.index({
        index: USER_INDEX,
        id: userDocument.user_id,
        document: userDocument,
        refresh: 'wait_for',
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
        console.log('Search Service: Ignored non-indexable user event', {
            eventType,
            routingKey: message?.fields?.routingKey,
        });
        return true;
    }

    const payload = rawPayload?.user ?? rawPayload?.data?.user ?? rawPayload?.data ?? rawPayload;
    await indexUserDocument(payload, eventType);
    console.log('Search Service: Indexed user event', {
        eventType,
        user_id: payload?.user_id ?? payload?.id ?? payload?._id,
        routingKey: message?.fields?.routingKey,
    });
    return true;
};

export const startUserEventConsumer = async () => {
    await ensureUsersIndex();
    await connectRabbitMq();

    const channel = getRabbitMqChannel();

    await channel.assertExchange(USER_EVENTS_EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(USER_EVENTS_QUEUE, { durable: true });
    await channel.bindQueue(USER_EVENTS_QUEUE, USER_EVENTS_EXCHANGE, 'user.*');
    await channel.prefetch(20);

    const queueState = await channel.checkQueue(USER_EVENTS_QUEUE);
    console.log('Search Service: user events queue state', {
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
            console.error('Search Service: Failed to process user event:', error.message);
            channel.nack(message, false, false);
        }
    }, { noAck: false });

    consumerTag = consumer.consumerTag;
};

export const stopUserEventConsumer = async () => {
    const channel = getRabbitMqChannel();

    if (channel && consumerTag) {
        try {
            await channel.cancel(consumerTag);
        } catch (error) {
            console.error('Search Service: Failed to stop user event consumer:', error.message);
        }
    }

    consumerTag = null;
};