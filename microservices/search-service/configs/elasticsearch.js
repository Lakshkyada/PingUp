import dotenv from 'dotenv';
import elasticsearch from 'elasticsearch';

dotenv.config();

export const USER_INDEX = 'users';

const elasticUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

// Extract hostname from URL for logging (hide password)
const getNodeDisplay = (url) => {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.hostname}`;
    } catch {
        return url;
    }
};

export const client = new elasticsearch.Client({
    host: elasticUrl,
    // Legacy client is more lenient with Bonsai's product identification
});

console.log('Search Service: Elasticsearch client created with host:', getNodeDisplay(elasticUrl));

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
    console.log(`Search Service: Connecting to Elasticsearch at ${getNodeDisplay(elasticUrl)}`);

    // ✅ Check connection
    try {
        await client.ping();
        console.log('Search Service: Elasticsearch cluster reachable');
    } catch (err) {
        console.error('Search Service: Elasticsearch connection failed:', err);
        throw err;
    }

    try {
        // Check if index exists by attempting to get settings
        // 404 means it doesn't exist
        let indexExists = false;
        try {
            await client.indices.get({ index: USER_INDEX });
            indexExists = true;
            console.log('Search Service: Index "users" already exists');
        } catch (err) {
            // 404 = index doesn't exist, which is expected
            if (err?.statusCode === 404 || err?.meta?.statusCode === 404) {
                indexExists = false;
                console.log('Search Service: Index "users" does not exist, will create it');
            } else {
                throw err;
            }
        }

        if (!indexExists) {
            console.log('Search Service: Creating users index with mappings...');

            const response = await client.indices.create({
                index: USER_INDEX,
                body: { mappings: userIndexMappings },
            });

            console.log('Search Service: Index created successfully', {
                acknowledged: response?.acknowledged,
            });
        }
    } catch (err) {
        console.error('Search Service: Error ensuring index:', err.message);
        console.error('Search Service: Error details:', {
            statusCode: err?.statusCode,
            displayName: err?.displayName,
            message: err?.message,
        });
        throw err;
    }
};

export const closeElasticsearchClient = async () => {
    try {
        await client.close();
        console.log('Search Service: Elasticsearch client closed');
    } catch (err) {
        console.error('Search Service: Error closing client:', err);
    }
};

export default client;