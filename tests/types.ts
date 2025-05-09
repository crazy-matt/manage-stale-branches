import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// Define specific response types for each endpoint we're using
type ListBranchesResponseData = RestEndpointMethodTypes['repos']['listBranches']['response']['data'];
type GetCommitResponseData = RestEndpointMethodTypes['repos']['getCommit']['response']['data'];

// Generic type for Octokit responses
type OctokitResponse<T> = {
    data: T;
    status: 200;
    url: string;
    headers: {
        'x-github-media-type': string;
        'x-ratelimit-limit': string;
        'x-ratelimit-remaining': string;
    };
};

// Helper function to create type-safe mock responses
export function createMockResponse<T>(data: T): OctokitResponse<T> {
    return {
        data,
        status: 200,
        url: 'https://api.github.com/mock',
        headers: {
            'x-github-media-type': 'github.v3',
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4999',
        }
    };
}

// Type-safe mock factory for branch response
export function createBranchResponse(name: string): ListBranchesResponseData[0] {
    return {
        name,
        commit: {
            sha: 'mock-sha',
            url: `https://api.github.com/repos/owner/repo/commits/mock-sha`
        },
        protected: false
    };
}

// Type-safe mock factory for commit response
export function createCommitResponse(date: string): GetCommitResponseData {
    return {
        commit: {
            author: null,
            committer: {
                name: 'Test User',
                email: 'test@example.com',
                date
            },
            message: 'Test commit',
            tree: {
                sha: 'mock-tree-sha',
                url: 'https://api.github.com/repos/owner/repo/git/trees/mock-tree-sha'
            },
            url: 'https://api.github.com/repos/owner/repo/git/commits/mock-commit-sha',
            comment_count: 0
        },
        sha: 'mock-commit-sha',
        url: 'https://api.github.com/repos/owner/repo/commits/mock-commit-sha',
        node_id: 'mock-node-id',
        html_url: 'https://github.com/owner/repo/commit/mock-commit-sha',
        comments_url: 'https://api.github.com/repos/owner/repo/commits/mock-commit-sha/comments',
        author: null,
        committer: null,
        parents: []
    };
}

// Helper functions for date manipulation
export const dateHelpers = {
    createDate: (timeAgo: string): string => {
        const match = timeAgo.trim().match(/^(-?\d+)\s*([hdw])$/i);
        if (!match) {
            throw new Error('Invalid time format');
        }

        const [, value, unit] = match;
        const numValue = parseInt(value, 10);

        // Convert to milliseconds
        const HOUR_IN_MS = 60 * 60 * 1000;
        const DAY_IN_MS = 24 * HOUR_IN_MS;
        const WEEK_IN_MS = 7 * DAY_IN_MS;

        let milliseconds: number;
        switch (unit.toLowerCase()) {
            case 'h':
                milliseconds = numValue * HOUR_IN_MS;
                break;
            case 'd':
                milliseconds = numValue * DAY_IN_MS;
                break;
            case 'w':
                milliseconds = numValue * WEEK_IN_MS;
                break;
            default:
                throw new Error(`Unknown unit '${unit}'`);
        }

        return new Date(Date.now() - milliseconds).toISOString();
    }
};
