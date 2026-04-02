import client, { USER_INDEX } from '../configs/elasticsearch.js';

const SEARCH_FIELDS = ['username^3', 'email^2', 'full_name^2', 'location', 'bio'];

const toUserResponse = (source = {}) => ({
    user_id: source.user_id ?? '',
    username: source.username ?? '',
    name: source.name ?? source.full_name ?? '',
    bio: source.bio ?? '',
    profile_picture: source.profile_picture ?? '',
    followers_count: Number(source.followers_count ?? 0),
});

const parseBooleanQuery = (value, defaultValue = false) => {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'y'].includes(normalized)) {
            return true;
        }
        if (['0', 'false', 'no', 'n'].includes(normalized)) {
            return false;
        }
    }

    return defaultValue;
};

const searchUsersFromElastic = async (query, currentUserId, excludeCurrentUser = false) => {
    const response = await client.search({
        index: USER_INDEX,
        size: 20,
        query: {
            bool: {
                should: [
                    {
                        multi_match: {
                            query,
                            fields: SEARCH_FIELDS,
                            fuzziness: 'AUTO',
                            type: 'best_fields',
                        },
                    },
                    {
                        multi_match: {
                            query,
                            fields: ['username^4', 'full_name^3', 'email^2'],
                            type: 'phrase_prefix',
                        },
                    },
                ],
                minimum_should_match: 1,
            },
        },
    });
    console.log('Elasticsearch response:', {
        took: response?.took,
        total: response?.hits?.total,
        hitsCount: response?.hits?.hits?.length ?? response?.body?.hits?.hits?.length ?? 0,
    });
    const hits = response?.hits?.hits ?? response?.body?.hits?.hits ?? [];

    const users = hits
        .map((hit) => toUserResponse(hit?._source ?? hit?.source ?? {}));

    if (!excludeCurrentUser || !currentUserId) {
        return users;
    }

    return users.filter((user) => user.user_id !== currentUserId);
};

const handleUserSearch = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { query, excludeSelf } = req.query;
        const shouldExcludeSelf = parseBooleanQuery(excludeSelf, false);
        console.log(`Search query: "${query}" from user ID: ${userId}`);
        if (!query || query.trim() === '') {
            return res.json({ success: true, users: [] });
        }

        const users = await searchUsersFromElastic(query.trim(), userId, shouldExcludeSelf);
        console.log(`Found ${users.length} users for query "${query}"`);    
        res.json({ success: true, users });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const searchUsers = handleUserSearch;
export const globalSearch = handleUserSearch;