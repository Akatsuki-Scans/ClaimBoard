export interface AnilistManga {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  coverImage: {
    extraLarge?: string;
    large?: string;
    medium?: string;
  };
  bannerImage?: string | null;
  description?: string | null;
  status?: string;
  chapters?: number | null;
  volumes?: number | null;
  genres?: string[];
  staff?: {
    edges: Array<{
      role: string;
      node: {
        name: {
          full: string;
        };
      };
    }>;
  };
}

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

const SEARCH_MANGA_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 8) {
    media(search: $search, type: MANGA, sort: [POPULARITY_DESC, SEARCH_MATCH]) {
      id
      title {
        romaji
        english
        native
      }
      coverImage {
        extraLarge
        large
        medium
      }
      bannerImage
      description
      status
      chapters
      volumes
      genres
      staff(perPage: 4) {
        edges {
          role
          node {
            name {
              full
            }
          }
        }
      }
    }
  }
}
`;

export async function searchAnilistManga(search: string): Promise<AnilistManga[]> {
  if (!search.trim()) return [];

  const response = await fetch(ANILIST_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: SEARCH_MANGA_QUERY,
      variables: { search: search.trim() },
    }),
  });

  if (!response.ok) {
    throw new Error(`AniList API returned ${response.status}`);
  }

  const data = await response.json();
  return data?.data?.Page?.media || [];
}
