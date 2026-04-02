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

const searchUsersFromElastic = async (query, currentUserId) => {
    const response = await client.search({
        index: USER_INDEX,
        size: 20,
        query: {
            multi_match: {
                query,
                fields: SEARCH_FIELDS,
                fuzziness: 'AUTO',
                type: 'best_fields',
            },
        },
    });

    const hits = response?.hits?.hits ?? response?.body?.hits?.hits ?? [];

    return hits
        .map((hit) => toUserResponse(hit?._source ?? hit?.source ?? {}))
        .filter((user) => !currentUserId || user.user_id !== currentUserId);
};

const handleUserSearch = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { query } = req.query;
        console.log(`Search query: "${query}" from user ID: ${userId}`);
        if (!query || query.trim() === '') {
            return res.json({ success: true, users: [] });
        }

        const users = await searchUsersFromElastic(query.trim(), userId);

        res.json({ success: true, users });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const searchUsers = handleUserSearch;
export const globalSearch = handleUserSearch;