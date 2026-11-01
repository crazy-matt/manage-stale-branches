import { beforeEach, describe, expect, test, vi } from 'vitest';
import createDebug from 'debug';
const debug = createDebug('manage-stale-branches:test:main');
import { run } from '../src/main.js';
import { createRateLimitResponse, mockCore, mockOctokit } from './setup.js';
import { createMockResponse, createBranchResponse, createCommitResponse, dateHelpers } from './types.js';

type TestBranch = { name: string; time: string; protected?: boolean };

// Mirrors @actions/core: missing inputs are empty strings, booleans are 'true' or 'false'
function setInputs(inputs: Record<string, string>): void {
    mockCore.getInput.mockImplementation((name: string) => inputs[name] ?? '');
    mockCore.getBooleanInput.mockImplementation((name: string) => inputs[name] === 'true');
}

function mockBranches(branches: TestBranch[]): void {
    mockOctokit.rest.repos.listBranches.mockResolvedValue(
        createMockResponse(branches.map((b) => createBranchResponse(b.name, b.protected)))
    );
    mockOctokit.rest.repos.getCommit.mockImplementation(({ ref }: { ref: string }) => {
        const branch = branches.find((b) => b.name === ref);
        if (!branch) {
            throw new Error(`Branch ${ref} not found in test data`);
        }
        return Promise.resolve(
            createMockResponse(createCommitResponse(dateHelpers.createDate(branch.time)))
        );
    });
}

describe('Stale Branch Manager', () => {
    beforeEach(() => {
        vi.setSystemTime(new Date(Date.now()));
        setInputs({});
        vi.stubEnv('GITHUB_TOKEN', 'mock-env-github-token');
    });

    // Category: Input Validation
    describe('Input Validation', () => {
        test('should use default values for optional inputs', async () => {
            await run();

            // Verify token from env is used (no failure)
            expect(mockCore.setFailed).not.toHaveBeenCalled();

            // Verify inputs were requested
            expect(mockCore.getInput).toHaveBeenCalledWith('stale-duration');
            expect(mockCore.getInput).toHaveBeenCalledWith('suggested-duration');

            // Verify the action processes with default values
            expect(mockCore.info).toHaveBeenCalledWith('No merged branch to process.');
            expect(mockCore.info).toHaveBeenCalledWith('No stale branch to process.');
        });

        test('should validate authentication token availability', async () => {
            vi.stubEnv('GITHUB_TOKEN', '');

            await run();

            expect(mockCore.setFailed).toHaveBeenCalledWith(
                expect.stringContaining('No authentication token found')
            );
        });
    });

    // Category: Time Unit Parsing
    describe('Time Unit Parsing', () => {
        test.each([
            ['60d', '61d'],    // 60 days threshold, branch is 61 days old
            ['1w', '8d'],      // 1 week threshold, branch is 8 days old
            ['168h', '169h'],  // 168 hours threshold, branch is 169 hours old
            ['2w', '15d'],     // 2 weeks threshold, branch is 15 days old
            ['48h', '49h'],    // 48 hours threshold, branch is 49 hours old
            [' 60 d ', '61d'], // handles whitespace, branch is 61 days old
        ])('should parse "%s" correctly', async (staleDuration, branchAge) => {
            setInputs({ 'stale-duration': staleDuration, 'suggested-duration': '30d' });

            const branchName = 'test-branch';

            debug('Test parameters:', { staleDuration, branchAge });

            mockBranches([{ name: branchName, time: branchAge }]);

            await run();

            // Log the actual calls to setOutput
            debug('setOutput calls:', mockCore.setOutput.mock.calls);

            expect(mockCore.setOutput).toHaveBeenCalledWith('merged-branches-count', 0);
            expect(mockCore.setOutput).toHaveBeenCalledWith('stale-branches-count', 1);
            expect(mockCore.setOutput).toHaveBeenCalledWith('suggested-branches-count', 0);
            expect(mockCore.setOutput).toHaveBeenCalledWith('merged-branches', '[]');
            expect(mockCore.setOutput).toHaveBeenCalledWith('stale-branches', JSON.stringify([branchName]));
            expect(mockCore.setOutput).toHaveBeenCalledWith('suggested-branches', '[]');
        });

        test.each([
            ['60x', 'Invalid format for stale-duration'],
            ['60d 8h', 'Invalid format for stale-duration'],
            ['d', 'Invalid format for stale-duration'],
            ['sixty days', 'Invalid format for stale-duration'],
            ['0d', 'Invalid format for stale-duration: value must be positive'],
            ['-1d', 'Invalid format for stale-duration: value must be positive'],
        ])('should reject invalid input "%s"', async (input, expectedError) => {
            setInputs({ 'stale-duration': input, 'suggested-duration': '30d' });

            await run();

            expect(mockCore.setFailed).toHaveBeenCalledWith(expectedError);
        });
    });

    // Category: Branch Classification
    describe('Branch Classification', () => {
        const branches: TestBranch[] = [
            { name: 'main', time: '70d' },
            { name: 'stale-1', time: '61d' },
            { name: 'stale-2', time: '61d' },
            { name: 'suggested-1', time: '60d' },
            { name: 'suggested-2', time: '31d' },
            { name: 'active-1', time: '10d' }
        ];

        beforeEach(() => {
            mockBranches(branches);
        });

        test('should properly categorize branches based on age', async () => {
            await run();

            expect(mockCore.setOutput.mock.calls).toEqual([
                ['summary',
                    "Deleted stale branches: stale-1, stale-2\n" +
                    "Suggested stale branches: suggested-1, suggested-2\n"
                ],
                ['merged-branches-count', 0],
                ['merged-branches', '[]'],
                ['stale-branches-count', 2],
                ['stale-branches', JSON.stringify(['stale-1', 'stale-2'])],
                ['suggested-branches-count', 2],
                ['suggested-branches', JSON.stringify(['suggested-1', 'suggested-2'])]
            ]);
        });

        test('should respect excluded branches', async () => {
            setInputs({ 'exclude-patterns': 'stale-1' });

            await run();

            expect(mockCore.setOutput).toHaveBeenCalledWith(
                'stale-branches',
                JSON.stringify(['stale-2'])
            );
        });

        test('should delete merged branches regardless of age', async () => {
            mockBranches([
                { name: 'behind-1', time: '1d' },
                { name: 'identical-1', time: '1d' },
            ]);
            mockOctokit.rest.repos.compareCommitsWithBasehead.mockImplementation(
                ({ basehead }: { basehead: string }) =>
                    Promise.resolve(createMockResponse(
                        basehead.endsWith('heads/behind-1')
                            ? { status: 'behind', ahead_by: 0, behind_by: 3 }
                            : { status: 'identical', ahead_by: 0, behind_by: 0 }
                    ))
            );

            await run();

            expect(mockCore.setOutput).toHaveBeenCalledWith(
                'merged-branches',
                JSON.stringify(['behind-1', 'identical-1'])
            );
            expect(mockCore.setOutput).toHaveBeenCalledWith('stale-branches', '[]');
            expect(mockOctokit.rest.git.deleteRef).toHaveBeenCalledWith(
                expect.objectContaining({ ref: 'heads/behind-1' })
            );
            expect(mockOctokit.rest.git.deleteRef).toHaveBeenCalledWith(
                expect.objectContaining({ ref: 'heads/identical-1' })
            );
        });

        test('should skip protected branches', async () => {
            mockBranches([
                { name: 'release-1', time: '70d', protected: true },
                { name: 'stale-1', time: '70d' },
            ]);

            await run();

            expect(mockOctokit.rest.git.deleteRef).not.toHaveBeenCalledWith(
                expect.objectContaining({ ref: 'heads/release-1' })
            );
            expect(mockCore.setOutput).toHaveBeenCalledWith(
                'stale-branches',
                JSON.stringify(['stale-1'])
            );
        });

        test('should classify old branches as stale when the comparison fails', async () => {
            mockBranches([{ name: 'old-1', time: '400d' }]);
            mockOctokit.rest.repos.compareCommitsWithBasehead.mockRejectedValue(
                new Error('Server Error')
            );

            await run();

            expect(mockCore.warning).toHaveBeenCalledWith(
                expect.stringContaining('Failed to check comparison status for old-1')
            );
            expect(mockCore.setOutput).toHaveBeenCalledWith(
                'stale-branches',
                JSON.stringify(['old-1'])
            );
        });
    });

    // Category: Archive Functionality
    describe('Archive Functionality', () => {
        const branchName = 'stale-1';
        const mockSha = 'mock-sha-123';

        beforeEach(() => {
            setInputs({ 'archive-stale': 'true' });
            mockBranches([{ name: branchName, time: '70d' }]);
            mockOctokit.rest.git.getRef.mockResolvedValue(
                createMockResponse({ object: { sha: mockSha } })
            );
        });

        test('should archive before deletion when archive-stale is true', async () => {
            await run();

            // Verify archive tag creation
            expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
                owner: 'testOwner',
                repo: 'testRepo',
                ref: `refs/tags/archive/${branchName}`,
                sha: mockSha
            });

            // Verify branch deletion after archiving
            expect(mockOctokit.rest.git.deleteRef).toHaveBeenCalledWith({
                owner: 'testOwner',
                repo: 'testRepo',
                ref: `heads/${branchName}`
            });
            expect(mockOctokit.rest.git.createRef.mock.invocationCallOrder[0]).toBeLessThan(
                mockOctokit.rest.git.deleteRef.mock.invocationCallOrder[0]
            );
        });

        test('should warn when archive branch creation fails', async () => {
            mockOctokit.rest.git.createRef.mockRejectedValue(
                new Error('Failed to create archive ref')
            );

            await run();

            // Verify that a warning was issued with the correct message
            expect(mockCore.warning).toHaveBeenCalledWith(
                expect.stringMatching(/^Failed to process branch \[stale-1\]:/)
            );

            // Verify that deleteRef was not called since archiving failed
            expect(mockOctokit.rest.git.deleteRef).not.toHaveBeenCalled();

            // Verify the failure is reported as such, not as a rate limit stop
            expect(mockCore.setOutput).toHaveBeenCalledWith('stale-branches', '[]');
            expect(mockCore.warning).not.toHaveBeenCalledWith(
                expect.stringContaining('Rate limit threshold reached')
            );
        });

        test('should not archive merged branches', async () => {
            mockOctokit.rest.repos.compareCommitsWithBasehead.mockResolvedValue(
                createMockResponse({ status: 'behind', ahead_by: 0, behind_by: 2 })
            );

            await run();

            expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
            expect(mockOctokit.rest.git.deleteRef).toHaveBeenCalledWith(
                expect.objectContaining({ ref: `heads/${branchName}` })
            );
        });
    });

    // Category: Dry Run Mode
    describe('Dry Run Mode', () => {
        beforeEach(() => {
            setInputs({ 'dry-run': 'true' });
            mockBranches([
                { name: 'stale-1', time: '70d' },
                { name: 'suggested-1', time: '40d' },
            ]);
        });

        test('should not modify branches in dry-run mode', async () => {
            await run();

            expect(mockOctokit.rest.git.deleteRef).not.toHaveBeenCalled();
            expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
            expect(mockCore.info).toHaveBeenCalledWith(
                expect.stringContaining('Dry-run mode enabled')
            );
        });

        test('should output properly formatted JSON arrays for Github matrix usage', async () => {
            await run();

            // Verify JSON array outputs are properly formatted for GitHub Actions matrix
            const staleCall = mockCore.setOutput.mock.calls.find(
                call => call[0] === 'stale-branches'
            );
            const suggestedCall = mockCore.setOutput.mock.calls.find(
                call => call[0] === 'suggested-branches'
            );

            // Verify that both outputs were called
            expect(staleCall).toBeDefined();
            expect(suggestedCall).toBeDefined();

            // Now we can safely access the values knowing they exist
            const staleOutput = staleCall![1];
            const suggestedOutput = suggestedCall![1];

            // Verify the outputs are valid JSON arrays
            expect(() => JSON.parse(staleOutput)).not.toThrowError();
            expect(() => JSON.parse(suggestedOutput)).not.toThrowError();
            expect(JSON.parse(staleOutput)).toEqual(['stale-1']);
            expect(JSON.parse(suggestedOutput)).toEqual(['suggested-1']);
        });
    });

    // Category: Error Handling
    describe('Error Handling', () => {
        test('should handle API errors gracefully', async () => {
            mockOctokit.rest.repos.listBranches.mockRejectedValue(
                new Error('API Error')
            );

            await run();

            expect(mockCore.setFailed).toHaveBeenCalledWith('API Error');
        });

        test('should skip branches with missing commit dates and process the others', async () => {
            const commit = createCommitResponse('');
            commit.commit.committer = null;

            mockBranches([
                { name: 'branch-1', time: '70d' },
                { name: 'stale-1', time: '70d' },
            ]);
            mockOctokit.rest.repos.getCommit.mockImplementation(({ ref }: { ref: string }) =>
                Promise.resolve(createMockResponse(
                    ref === 'branch-1'
                        ? commit
                        : createCommitResponse(dateHelpers.createDate('70d'))
                ))
            );

            await run();

            expect(mockCore.warning).toHaveBeenCalledWith(
                expect.stringContaining('Skipping branch branch-1')
            );
            expect(mockCore.setFailed).not.toHaveBeenCalled();
            expect(mockCore.setOutput).toHaveBeenCalledWith(
                'stale-branches',
                JSON.stringify(['stale-1'])
            );
        });

        test('should keep processing other branches when one deletion fails', async () => {
            mockBranches([
                { name: 'stale-1', time: '70d' },
                { name: 'stale-2', time: '70d' },
            ]);
            mockOctokit.rest.git.deleteRef.mockImplementation(({ ref }: { ref: string }) =>
                ref === 'heads/stale-1'
                    ? Promise.reject(new Error('Reference does not exist'))
                    : Promise.resolve(createMockResponse(undefined))
            );

            await run();

            expect(mockCore.warning).toHaveBeenCalledWith(
                expect.stringMatching(/^Failed to process branch \[stale-1\]:/)
            );
            expect(mockCore.warning).not.toHaveBeenCalledWith(
                expect.stringContaining('Rate limit threshold reached')
            );
            expect(mockCore.setOutput).toHaveBeenCalledWith(
                'stale-branches',
                JSON.stringify(['stale-2'])
            );
        });
    });

    // Category: API Interaction Patterns
    describe('API Interaction Patterns', () => {
        test('should handle empty repositories', async () => {
            await run();

            expect(mockCore.info).toHaveBeenCalledWith('Fetching branches from testOwner/testRepo...');
            expect(mockCore.info).toHaveBeenCalledWith('No merged branch to process.');
            expect(mockCore.info).toHaveBeenCalledWith('No stale branch to process.');
            expect(mockCore.setOutput).toHaveBeenCalledWith('stale-branches', '[]');
            expect(mockCore.setOutput).toHaveBeenCalledWith('suggested-branches', '[]');
        });

        test('should process branches with correct concurrency', async () => {
            setInputs({ concurrency: '2', 'stale-duration': '60d', 'suggested-duration': '30d' });

            // Make all branches stale (older than the 60d threshold)
            const branchConfigs = Array.from({ length: 6 }, (_, i) => ({
                name: `stale-${i}`,
                time: '70d'
            }));
            mockBranches(branchConfigs);

            const deleteCalls: string[] = [];
            let inProgress = 0;
            let maxConcurrent = 0;

            mockOctokit.rest.git.deleteRef.mockImplementation(async ({ ref }: { ref: string }) => {
                inProgress++;
                maxConcurrent = Math.max(maxConcurrent, inProgress);
                deleteCalls.push(ref);
                // Add small delay to ensure concurrent operations overlap
                await new Promise(resolve => setTimeout(resolve, 10));
                inProgress--;
            });

            await run();

            // Verify that all branches were processed
            expect(deleteCalls).toHaveLength(branchConfigs.length);
            // Verify the concurrency limit was respected
            expect(maxConcurrent).toBe(2);
        });

        test('should fetch every page of branches', async () => {
            // More branches than the API returns on one page
            const names = Array.from({ length: 35 }, (_, i) => `stale-${i}`);
            mockBranches(names.map((name) => ({ name, time: '70d' })));
            mockOctokit.rest.repos.listBranches.mockResolvedValue(createMockResponse([]));
            mockOctokit.paginate.mockResolvedValue(names.map((name) => createBranchResponse(name)));

            await run();

            expect(mockOctokit.paginate).toHaveBeenCalledWith(
                mockOctokit.rest.repos.listBranches,
                expect.objectContaining({ owner: 'testOwner', repo: 'testRepo' })
            );
            expect(mockCore.setOutput).toHaveBeenCalledWith('stale-branches-count', 35);
        });
    });

    // Category: Rate Limiting
    describe('Rate Limiting', () => {
        test('should exit early when the threshold is already reached', async () => {
            mockOctokit.rest.rateLimit.get.mockResolvedValue(createRateLimitResponse(0));
            mockBranches([{ name: 'stale-1', time: '70d' }]);

            await run();

            expect(mockOctokit.rest.repos.getCommit).not.toHaveBeenCalled();
            expect(mockOctokit.rest.git.deleteRef).not.toHaveBeenCalled();
            expect(mockCore.setOutput).not.toHaveBeenCalled();
            expect(mockCore.setFailed).not.toHaveBeenCalled();
        });

        test('should use the rate-limit-threshold input', async () => {
            setInputs({ 'rate-limit-threshold': '50' });
            // 60% of the limit is used
            mockOctokit.rest.rateLimit.get.mockResolvedValue(createRateLimitResponse(2000));
            mockBranches([{ name: 'stale-1', time: '70d' }]);

            await run();

            expect(mockOctokit.rest.repos.getCommit).not.toHaveBeenCalled();
            expect(mockCore.setOutput).not.toHaveBeenCalled();
        });

        test('should default the threshold to 100%', async () => {
            // 96% of the limit is used
            mockOctokit.rest.rateLimit.get.mockResolvedValue(createRateLimitResponse(200));
            mockBranches([{ name: 'stale-1', time: '70d' }]);

            await run();

            expect(mockCore.setOutput).toHaveBeenCalledWith(
                'stale-branches',
                JSON.stringify(['stale-1'])
            );
        });

        test('should stop without deleting when the threshold is reached while reading branches', async () => {
            // Healthy for: initial check, repos.get, listBranches
            mockOctokit.rest.rateLimit.get
                .mockResolvedValueOnce(createRateLimitResponse(4999))
                .mockResolvedValueOnce(createRateLimitResponse(4998))
                .mockResolvedValueOnce(createRateLimitResponse(4997))
                .mockResolvedValue(createRateLimitResponse(0));
            mockBranches([{ name: 'stale-1', time: '70d' }]);

            await run();

            expect(mockOctokit.rest.repos.getCommit).toHaveBeenCalled();
            expect(mockOctokit.rest.git.deleteRef).not.toHaveBeenCalled();
            expect(mockCore.setOutput).not.toHaveBeenCalled();
            expect(mockCore.setFailed).not.toHaveBeenCalled();
        });

        test('should stop when the threshold is reached while deleting branches', async () => {
            // Healthy for: initial check, repos.get, listBranches, branch info
            mockOctokit.rest.rateLimit.get
                .mockResolvedValueOnce(createRateLimitResponse(4999))
                .mockResolvedValueOnce(createRateLimitResponse(4998))
                .mockResolvedValueOnce(createRateLimitResponse(4997))
                .mockResolvedValueOnce(createRateLimitResponse(4996))
                .mockResolvedValue(createRateLimitResponse(0));
            mockBranches([{ name: 'stale-1', time: '70d' }]);

            await run();

            expect(mockOctokit.rest.git.deleteRef).toHaveBeenCalledTimes(1);
            expect(mockCore.warning).toHaveBeenCalledWith(
                expect.stringContaining('Rate limit threshold reached during stale branch processing')
            );
            expect(mockCore.setOutput).not.toHaveBeenCalled();
        });

        test('should continue when the rate limit cannot be checked', async () => {
            mockOctokit.rest.rateLimit.get.mockRejectedValue(new Error('Service Unavailable'));
            mockBranches([{ name: 'stale-1', time: '70d' }]);

            await run();

            expect(mockCore.warning).toHaveBeenCalledWith(
                expect.stringContaining('Failed to check rate limit: Service Unavailable')
            );
            expect(mockCore.setOutput).toHaveBeenCalledWith(
                'stale-branches',
                JSON.stringify(['stale-1'])
            );
        });
    });
});
