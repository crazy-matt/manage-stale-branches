import { beforeEach, describe, expect, test, vi } from 'vitest';
import { run } from '../src/index';
import { mockCore, mockOctokit } from './setup';
import { createMockResponse, createBranchResponse, createCommitResponse, dateHelpers } from './types';

describe('Stale Branch Manager', () => {
    // Global state with minimal required inputs
    const globalState = {
        inputs: {
            'dry-run': false
        },
        env: {
            GITHUB_TOKEN: 'mock-env-github-token'
        },
    };

    beforeEach(() => {
        const nowTime = Date.now();
        vi.setSystemTime(new Date(nowTime));

        // Setup default mocks
        mockCore.getInput.mockImplementation((name: string) => globalState.inputs[name]);
        mockCore.getBooleanInput.mockImplementation((name: string) => !!globalState.inputs[name]);

        vi.stubEnv('GITHUB_TOKEN', globalState.env.GITHUB_TOKEN);
    });

    // Category: Input Validation
    describe('Input Validation', () => {
        // No category state needed as we're testing default behavior

        test('should use default values for optional inputs', async () => {
            // Mock empty branches list to prevent further processing
            mockOctokit.rest.repos.listBranches.mockResolvedValue({ data: [] });

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
            // Clear both the input and env token
            mockCore.getInput.mockImplementation(() => '');
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
            mockCore.getInput.mockImplementation((name: string) => {
                if (name === 'stale-duration') return staleDuration;
                if (name === 'suggested-duration') return '30d';
                return '';
            });

            const branchName = 'test-branch';
            mockOctokit.rest.repos.listBranches.mockResolvedValue(
                createMockResponse([createBranchResponse(branchName)])
            );

            mockOctokit.rest.repos.getCommit.mockResolvedValue(
                createMockResponse(
                    createCommitResponse(dateHelpers.createDate(branchAge))
                )
            );

            await run();

            // Verify branch was processed as stale
            expect(mockCore.setOutput).toHaveBeenCalledWith(
                'stale-branches',
                JSON.stringify([branchName])
            );
        });

        test.each([
            ['60x', 'Invalid format for stale-duration'],
            ['60d 8h', 'Invalid format for stale-duration'],
            ['d', 'Invalid format for stale-duration'],
            ['sixty days', 'Invalid format for stale-duration'],
            ['0d', 'Invalid format for stale-duration: value must be positive'],
            ['-1d', 'Invalid format for stale-duration: value must be positive'],
        ])('should reject invalid input "%s"', async (input, expectedError) => {
            mockCore.getInput.mockImplementation((name: string) => {
                if (name === 'stale-duration') return input;
                if (name === 'suggested-duration') return '30d';
                return '';
            });

            await run();

            expect(mockCore.setFailed).toHaveBeenCalledWith(expectedError);
        });
    });

    // Category: Branch Classification
    describe('Branch Classification', () => {
        const categoryState = {
            branches: [
                { name: 'main', time: '70d' },
                { name: 'stale-1', time: '61d' },
                { name: 'stale-2', time: '61d' },
                { name: 'suggested-1', time: '60d' },
                { name: 'suggested-2', time: '31d' },
                { name: 'active-1', time: '10d' }
            ]
        };

        beforeEach(() => {
            mockOctokit.rest.repos.listBranches.mockResolvedValue(
                createMockResponse(
                    categoryState.branches.map(({ name }) => createBranchResponse(name))
                )
            );

            // Set up compareCommits mock once for all branches
            mockOctokit.rest.repos.compareCommits.mockImplementation(({ base }) => {
                if (base === 'main') {
                    return Promise.resolve(createMockResponse({
                        data: {
                            status: "identical",
                        }
                    }));
                }
                return Promise.resolve(createMockResponse({
                    data: {
                        status: "diverged",
                    }
                }));
            });

            categoryState.branches.forEach(() => {
                mockOctokit.rest.repos.getCommit.mockImplementation(({ ref }) => {
                    const branch = categoryState.branches.find(b => b.name === ref);
                    if (!branch) {
                        throw new Error(`Branch ${ref} not found in test data`);
                    }
                    return Promise.resolve(
                        createMockResponse(
                            createCommitResponse(dateHelpers.createDate(branch.time))
                        )
                    );
                });
            });
        });

        test('should properly categorize branches based on age', async () => {
            await run();

            expect(mockCore.setOutput.mock.calls).toEqual([
                ['summary',
                    "Deleted stale branches: stale-1, stale-2\n" +
                    "Suggested stale branches: suggested-1, suggested-2\n"
                ],
                ['merged-branches-count', 0],
                ['stale-branches-count', 2],
                ['suggested-branches-count', 2],
                ['stale-branches', JSON.stringify(['stale-1', 'stale-2'])],
                ['suggested-branches', JSON.stringify(['suggested-1', 'suggested-2'])]
            ]);
        });

        test('should respect excluded branches', async () => {
            mockCore.getInput.mockImplementation((name) => {
                if (name === 'exclude-patterns') return 'stale-1';
                return '';
            });

            await run();

            expect(mockCore.setOutput).toHaveBeenCalledWith(
                'stale-branches',
                JSON.stringify(['stale-2'])
            );
        });
    });

    // Category: Archive Functionality
    describe('Archive Functionality', () => {
        test('should archive before deletion when archive-stale is true', async () => {
            mockCore.getBooleanInput.mockImplementation((name) =>
                name === 'archive-stale' ? true : false
            );

            const branchName = 'stale-1';
            const timeOld = '70d';
            const mockSha = 'mock-sha-123';

            mockOctokit.rest.repos.listBranches.mockResolvedValue(
                createMockResponse([createBranchResponse(branchName)])
            );

            mockOctokit.rest.repos.getCommit.mockResolvedValue(
                createMockResponse(
                    createCommitResponse(dateHelpers.createDate(timeOld))
                )
            );

            mockOctokit.rest.git.getRef.mockResolvedValue(
                createMockResponse({ object: { sha: mockSha } })
            );

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
        });

        test('should warn when archive branch creation fails', async () => {
            // Enable archive mode
            mockCore.getBooleanInput.mockImplementation((name) =>
                name === 'archive-stale' ? true : false
            );

            // Setup a branch that will trigger archival
            const branchName = 'feature-to-archive';
            const timeOld = '70d';
            const mockSha = 'mock-sha-123';
            mockOctokit.rest.repos.listBranches.mockResolvedValue(
                createMockResponse([createBranchResponse(branchName)])
            );

            // Mock the commit date to make the branch stale
            mockOctokit.rest.repos.getCommit.mockResolvedValue(
                createMockResponse(
                    createCommitResponse(dateHelpers.createDate(timeOld))
                )
            );

            // Mock getRef to succeed but createRef to fail
            mockOctokit.rest.git.getRef.mockResolvedValue(
                createMockResponse({ object: { sha: mockSha } })
            );
            mockOctokit.rest.git.createRef.mockRejectedValue(
                new Error('Failed to create archive ref')
            );

            await run();

            // Verify that a warning was issued with the correct message
            expect(mockCore.warning).toHaveBeenCalledWith(
                expect.stringMatching(/^Failed to process branch feature-to-archive:/)
            );

            // Verify that deleteRef was not called since archiving failed
            expect(mockOctokit.rest.git.deleteRef).not.toHaveBeenCalled();
        });
    });

    // Category: Dry Run Mode
    describe('Dry Run Mode', () => {
        const categoryState = {
            inputs: {
                'dry-run': true
            },
            branches: [
                { name: 'stale-1', time: '70d' },
                { name: 'suggested-1', time: '40d' },
            ]
        };

        beforeEach(() => {
            mockCore.getBooleanInput.mockImplementation((name: string) => !!categoryState.inputs[name]);

            mockOctokit.rest.repos.listBranches.mockResolvedValue(
                createMockResponse(
                    categoryState.branches.map(({ name }) => createBranchResponse(name))
                )
            );

            categoryState.branches.forEach(() => {
                mockOctokit.rest.repos.getCommit.mockImplementation(({ ref }) => {
                    const branch = categoryState.branches.find(b => b.name === ref);
                    if (!branch) {
                        throw new Error(`Branch ${ref} not found in test data`);
                    }
                    return Promise.resolve(
                        createMockResponse(
                            createCommitResponse(dateHelpers.createDate(branch.time))
                        )
                    );
                });
            });
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

        test('should handle missing commit dates', async () => {
            // Mock repository info
            mockOctokit.rest.repos.get.mockResolvedValue({
                data: {
                    default_branch: 'main'
                }
            });

            // Mock branch list
            mockOctokit.rest.repos.listBranches.mockResolvedValue({
                data: [{ name: 'branch-1' }]
            });

            // Mock commit with missing dates
            mockOctokit.rest.repos.getCommit.mockResolvedValue({
                data: {
                    commit: {
                        committer: null,
                        author: null,
                        // Include other required commit properties
                        message: 'test commit'
                    }
                }
            });

            await run();

            expect(mockCore.warning).toHaveBeenCalledWith(
                expect.stringContaining('Skipping branch branch-1 due to missing commit date')
            );
        });
    });

    // Category: API Interaction Patterns
    describe('API Interaction Patterns', () => {
        test('should handle empty repositories', async () => {
            // Mock repository response first
            mockOctokit.rest.repos.get.mockResolvedValue({
                data: {
                    default_branch: 'main'
                }
            });

            // Mock empty branches list
            mockOctokit.rest.repos.listBranches.mockResolvedValue({
                data: []
            });

            await run();

            expect(mockCore.info).toHaveBeenCalledWith('Fetching branches from testOwner/testRepo...');
            expect(mockCore.info).toHaveBeenCalledWith('No merged branch to process.');
            expect(mockCore.info).toHaveBeenCalledWith('No stale branch to process.');
            expect(mockCore.setOutput).toHaveBeenCalledWith('stale-branches', '[]');
            expect(mockCore.setOutput).toHaveBeenCalledWith('suggested-branches', '[]');
        });

        test('should process branches with correct concurrency', async () => {
            // Set a specific concurrency value for testing and stale threshold
            mockCore.getInput.mockImplementation((name: string) => {
                if (name === 'concurrency') return '2';
                if (name === 'stale') return '60d';
                if (name === 'suggested') return '30d';
                return '';
            });

            const branchConfigs = Array.from({ length: 6 }, (_, i) => ({
                name: `stale-${i}`,
                time: '70d' // Make all branches stale (older than the 60d threshold)
            }));

            mockOctokit.rest.repos.listBranches.mockResolvedValue(
                createMockResponse(
                    branchConfigs.map(({ name }) => createBranchResponse(name))
                )
            );

            branchConfigs.forEach(() => {
                mockOctokit.rest.repos.getCommit.mockImplementation(({ ref }) => {
                    const branch = branchConfigs.find(b => b.name === ref);
                    if (!branch) {
                        throw new Error(`Branch ${ref} not found in test data`);
                    }
                    return Promise.resolve(
                        createMockResponse(
                            createCommitResponse(dateHelpers.createDate(branch.time))
                        )
                    );
                });
            });

            const deleteCalls: string[] = [];
            let inProgress = 0;
            let maxConcurrent = 0;

            mockOctokit.rest.git.deleteRef.mockImplementation(async ({ ref }) => {
                inProgress++;
                maxConcurrent = Math.max(maxConcurrent, inProgress);
                deleteCalls.push(ref);
                // Add small delay to ensure concurrent operations overlap
                await new Promise(resolve => setTimeout(resolve, 10));
                inProgress--;
                return Promise.resolve();
            });

            await run();

            // Verify that all branches were processed
            expect(deleteCalls).toHaveLength(branchConfigs.length);
            // Verify the concurrency limit was respected
            expect(maxConcurrent).toBeLessThanOrEqual(2);
            expect(mockOctokit.rest.git.deleteRef).toHaveBeenCalledTimes(branchConfigs.length);
        });
    });
});
