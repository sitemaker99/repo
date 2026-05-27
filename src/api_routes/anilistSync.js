const ANILIST_API_URL = 'https://graphql.anilist.co';

async function fetchAnilist(query, variables = {}) {
    const token = localStorage.getItem('anilist_token');
    if (!token) return null;

    try {
        const response = await fetch(ANILIST_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query, variables })
        });
        
        const data = await response.json();
        if (data.errors) {
            console.error('AniList API Error:', data.errors);
            return null;
        }
        return data.data;
    } catch (e) {
        console.error('AniList fetch error:', e);
        return null;
    }
}

/**
 * Gets the current authenticated AniList user's ID
 */
export async function getAnilistUserId() {
    const query = `
        query {
            Viewer {
                id
                name
            }
        }
    `;
    const data = await fetchAnilist(query);
    return data?.Viewer;
}

/**
 * Updates the user's progress on a manga in AniList.
 * @param {number} mediaId - The AniList media ID (usually matches our manga.anilistId).
 * @param {number} progress - The chapter number they are currently on.
 * @param {string} status - Optional status (CURRENT, COMPLETED, DROPPED, PAUSED, PLANNING).
 */
export async function syncProgressToAnilist(mediaId, progress, status = undefined) {
    if (!mediaId) return false;

    const mutation = `
        mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
            SaveMediaListEntry (mediaId: $mediaId, progress: $progress, status: $status) {
                id
                progress
                status
            }
        }
    `;

    const variables = { mediaId, progress };
    if (status) variables.status = status;

    const data = await fetchAnilist(mutation, variables);
    return !!data?.SaveMediaListEntry;
}
