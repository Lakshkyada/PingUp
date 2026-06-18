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
    if (typeof value === 'boolean') return value;

    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['1','true','yes','y'].includes(v)) return true;
        if (['0','false','no','n'].includes(v)) return false;
    }

    return defaultValue;
};

const searchUsersFromElastic = async (query, currentUserId, excludeCurrentUser = false) => {
    try {
        const response = await client.search({
            index: USER_INDEX,
            size: 10,
            body: {
                query: {
                    bool: {
                        should: [
                            {
                                multi_match: {
                                    query,
                                    fields: SEARCH_FIELDS,
                                    fuzziness: 'AUTO',
                                },
                            },
                            {
                                multi_match: {
                                    query,
                                    fields: ['username^4', 'full_name^3'],
                                    type: 'phrase_prefix',
                                },
                            },
                        ],
                    },
                },
            },
        });

        const hits = response.hits?.hits ?? [];

        console.log('Search result:', {
            total: response.hits?.total?.value ?? 0,
            hits: hits.length,
        });

        let users = hits.map(hit => toUserResponse(hit._source));

        if (excludeCurrentUser && currentUserId) {
            users = users.filter(u => u.user_id !== currentUserId);
        }

        return users;
    } catch (error) {
        console.error('Elasticsearch search error:', error.message);

        if (error?.meta?.body?.error?.type === 'index_not_found_exception') {
            return [];
        }

        throw error;
    }
};

export const searchUsers = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { query, excludeSelf } = req.query;

        if (!query || query.trim() === '') {
            return res.json({ success: true, users: [] });
        }

        const users = await searchUsersFromElastic(
            query.trim(),
            userId,
            parseBooleanQuery(excludeSelf, false)
        );

        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const globalSearch = searchUsers;