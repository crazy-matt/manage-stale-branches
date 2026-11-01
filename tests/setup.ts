import type * as core from '@actions/core';
import { beforeEach, vi } from 'vitest';
import { createMockResponse } from './types.js';

export const mockCore = {
    getInput: vi.fn<typeof core.getInput>(),
    getBooleanInput: vi.fn<typeof core.getBooleanInput>(),
    setOutput: vi.fn<typeof core.setOutput>(),
    setFailed: vi.fn<typeof core.setFailed>(),
    info: vi.fn<typeof core.info>(),
    warning: vi.fn<typeof core.warning>(),
};

export const mockOctokit = {
    paginate: vi.fn(),
    rest: {
        rateLimit: {
            get: vi.fn(),
        },
        repos: {
            listBranches: vi.fn(),
            getCommit: vi.fn(),
            get: vi.fn(),
            compareCommitsWithBasehead: vi.fn(),
        },
        git: {
            getRef: vi.fn(),
            createRef: vi.fn(),
            deleteRef: vi.fn(),
        },
        pulls: {
            list: vi.fn(),
        },
    },
};

export function createRateLimitResponse(remaining: number, limit = 5000) {
    const rate = { limit, used: limit - remaining, remaining, reset: 1767225600 };
    return createMockResponse({ resources: { core: rate }, rate });
}

//
// Default API behaviour, restored before each test because `mockReset` wipes it
//
beforeEach(() => {
    // Single-page stand-in for octokit.paginate: returns the data of one call
    mockOctokit.paginate.mockImplementation(
        async (method: (params: unknown) => Promise<{ data: unknown }>, params: unknown) =>
            (await method(params)).data
    );
    mockOctokit.rest.rateLimit.get.mockResolvedValue(createRateLimitResponse(4999));
    mockOctokit.rest.repos.get.mockResolvedValue(createMockResponse({ default_branch: 'main' }));
    mockOctokit.rest.repos.listBranches.mockResolvedValue(createMockResponse([]));
    mockOctokit.rest.pulls.list.mockResolvedValue(createMockResponse([]));
    mockOctokit.rest.repos.compareCommitsWithBasehead.mockResolvedValue(
        createMockResponse({ status: 'diverged', ahead_by: 1, behind_by: 1 })
    );
});

//
// Mock the modules used in this package as external dependencies
//
vi.mock('@actions/core', () => mockCore);

vi.mock('@actions/github', () => ({
    getOctokit: () => mockOctokit,
    context: {
        repo: {
            owner: 'testOwner',
            repo: 'testRepo',
        },
    },
}));
