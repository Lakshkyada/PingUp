import { Client } from '@elastic/elasticsearch';

export const USER_INDEX = 'users';

const client = new Client({
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    headers: {
        accept: 'application/vnd.elasticsearch+json; compatible-with=8',
        'content-type': 'application/vnd.elasticsearch+json; compatible-with=8',
    },
});

const userIndexMappings = {
    properties: {
        user_id: { type: 'keyword' },
        username: { type: 'text' },
        email: { type: 'text' },
        full_name: { type: 'text' },
        bio: { type: 'text' },
        location: { type: 'text' },
        profile_picture: { type: 'keyword' },
        followers_count: { type: 'integer' },
        created_at: { type: 'date' },
    },
};

export const ensureUsersIndex = async () => {
    const existsResponse = await client.indices.exists({ index: USER_INDEX });
    const exists = typeof existsResponse === 'boolean'
        ? existsResponse
        : existsResponse?.statusCode === 200;

    if (exists) {
        return;
    }

    await client.indices.create({
        index: USER_INDEX,
        mappings: userIndexMappings,
    });
};

export const closeElasticsearchClient = async () => {
    await client.close();
};

export default client;