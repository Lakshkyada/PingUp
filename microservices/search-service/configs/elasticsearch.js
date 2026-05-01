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
    const elasticUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
    console.log(`Search Service: Connecting to Elasticsearch at ${elasticUrl}`);

    await client.ping();
    console.log('Search Service: Elasticsearch cluster reachable');

    const existsResponse = await client.indices.exists({ index: USER_INDEX });
    const exists = typeof existsResponse === 'boolean'
        ? existsResponse
        : existsResponse?.statusCode === 200;

    if (exists) {
        console.log('Search Service: Elasticsearch index already exists');
        return;
    }

    console.log('Search Service: Elasticsearch index not found, creating now');
    await client.indices.create({
        index: USER_INDEX,
        mappings: userIndexMappings,
    });
    console.log('Search Service: Elasticsearch index created');
};

export const closeElasticsearchClient = async () => {
    await client.close();
};

export default client;