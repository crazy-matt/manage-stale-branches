import { vi } from 'vitest';

export const mockCore = {
    getInput: vi.fn(),
    getBooleanInput: vi.fn(),
    setOutput: vi.fn(),
    setFailed: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
};

export const mockOctokit = {
    rest: {
        repos: {
            listBranches: vi.fn(),
            getCommit: vi.fn(),
            get: vi.fn().mockResolvedValue({
                data: {
                    default_branch: 'main'
                }
            }),
            compareCommits: vi.fn(),
        },
        git: {
            getRef: vi.fn(),
            createRef: vi.fn(),
            deleteRef: vi.fn(),
        },
    },
};

//
// Mock the modules used in this package as external dependencies
//
vi.mock('@actions/core', () => mockCore);

vi.mock('@actions/github', () => ({
    getOctokit: vi.fn(() => mockOctokit),
    context: {
        repo: {
            owner: 'testOwner',
            repo: 'testRepo',
        },
    },
}));
