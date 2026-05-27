const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const FETCH_TIMEOUT_MS = 8000; // 8 second hard timeout

/** Fetch with a timeout to prevent indefinitely hanging requests */
function fetchWithTimeout(url, options, ms = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

export async function fetchAnilistDetails(anilistId) {
    if (!anilistId) return null;

    const query = `
    query ($id: Int) {
      Media (id: $id, type: MANGA) {
        id
        status
        seasonYear
        chapters
        volumes
        averageScore
        popularity
        characters(page: 1, perPage: 10, sort: [ROLE, RELEVANCE]) {
          edges {
            role
            node {
              id
              name { full }
              image { large }
            }
          }
        }
        staff(page: 1, perPage: 5) {
          edges {
            role
            node {
              id
              name { full }
            }
          }
        }
        trailer {
          id
          site
        }
      }
    }
    `;

    try {
        const res = await fetchWithTimeout(ANILIST_GRAPHQL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query, variables: { id: parseInt(anilistId, 10) } })
        });

        if (!res.ok) throw new Error(`AniList responded with ${res.status}`);

        const json = await res.json();
        const media = json?.data?.Media;
        if (!media) return null;

        return {
            averageScore: media.averageScore ?? null,
            popularity: media.popularity ?? null,
            publishedYear: media.seasonYear ?? null,
            status: media.status ?? null,
            totalChapters: media.chapters ?? null,
            totalVolumes: media.volumes ?? null,
            // Safe optional chaining on nested image fields
            characters: (media.characters?.edges ?? []).map(edge => ({
                name: edge?.node?.name?.full ?? 'Unknown',
                role: edge?.role ?? '',
                image: edge?.node?.image?.large ?? null,
            })),
            staff: (media.staff?.edges ?? []).map(edge => ({
                name: edge?.node?.name?.full ?? 'Unknown',
                role: edge?.role ?? '',
            })),
            trailer: (media.trailer?.site === 'youtube' && media.trailer?.id)
                ? `https://www.youtube.com/watch?v=${media.trailer.id}`
                : null,
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('AniList request timed out — skipping enrichment.');
        } else {
            console.error('Failed to fetch AniList details:', error);
        }
        return null; // Always fail gracefully — never crash the page
    }
}
