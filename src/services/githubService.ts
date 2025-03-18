import * as core from '@actions/core';
import pMap from 'p-map';
import createDebug from 'debug';
const debug = createDebug('manage-stale-branches:githubService');
import type { BranchInfo } from '../types/BranchInfo.js';
import type { RateLimitService } from './rateLimitService.js';

export class GithubService {
    private rateLimitService: RateLimitService | null = null;

    constructor(
        private octokit: any,
        private owner: string,
        private repo: string
    ) {}

    setRateLimitService(rateLimitService: RateLimitService): void {
        this.rateLimitService = rateLimitService;
    }

    private async executeWithRateLimitCheck<T>(
        operation: string,
        fn: () => Promise<T>
    ): Promise<T | null> {
        if (this.rateLimitService) {
            // Add proper type assertion for the return value
            return await this.rateLimitService.withRateLimitCheck<T>(operation)(
                fn
            );
        }
        return await fn();
    }

    async getBranchInfo(
        defaultBranch: string,
        branchName: string,
        staleCutoff: Date,
        suggestedCutoff: Date
    ): Promise<BranchInfo> {
        // Get the last commit date
        const getCommitResult = await this.executeWithRateLimitCheck(
            `getCommit for ${branchName}`,
            async () =>
                await this.octokit.rest.repos.getCommit({
                    owner: this.owner,
                    repo: this.repo,
                    ref: branchName,
                })
        );

        if (getCommitResult === null) {
            throw new Error(
                `Rate limit reached while getting commit for branch ${branchName}`
            );
        }

        const commit = getCommitResult.data;
        const commitDate =
            commit.commit.committer?.date || commit.commit.author?.date;
        if (!commitDate) {
            core.warning(
                `Skipping branch ${branchName} due to missing commit date`
            );
            throw new Error(`Missing commit date for branch ${branchName}`);
        }

        // Initialize comparison values
        let isMerged = false;
        let isStale = false;
        let isSuggested = false;
        let branchStatus = '';
        let aheadBy = 0;
        let behindBy = 0;
        const commitDateObj = new Date(commitDate);

        try {
            // Compare branch with default branch
            const basehead = `heads/${defaultBranch}...heads/${branchName}`;
            const compareResult = await this.executeWithRateLimitCheck(
                `compareCommits for ${branchName}`,
                async () =>
                    await this.octokit.rest.repos.compareCommitsWithBasehead({
                        owner: this.owner,
                        repo: this.repo,
                        basehead,
                    })
            );

            if (compareResult === null) {
                throw new Error(
                    `Rate limit reached while comparing commits for branch ${branchName}`
                );
            }

            const comparison = compareResult.data;

            // Update comparison values
            branchStatus = comparison.status;
            aheadBy = comparison.ahead_by;
            behindBy = comparison.behind_by;

            // A branch is considered merged if it's identical or behind the default branch
            isMerged =
                comparison.status === 'identical' ||
                comparison.status === 'behind';
            isStale = commitDateObj < staleCutoff;
            isSuggested = commitDateObj < suggestedCutoff;

            debug(`Branch ${branchName}:
                commitDate=${commitDate},
                staleCutoff=${staleCutoff},
                status=${branchStatus},
                isMerged=${isMerged},
                isStale=${isStale},
                isSuggested=${isSuggested}`);
        } catch (error) {
            core.warning(
                `Failed to check comparison status for ${branchName}: ${(error as Error).message}`
            );
        }

        return {
            name: branchName,
            isMerged,
            isStale,
            isSuggested,
            lastCommitDate: commitDateObj,
            branchStatus,
            aheadBy,
            behindBy,
        };
    }

    async deleteOrArchiveBranches(
        branches: BranchInfo[],
        archiveStale: boolean,
        dryRun: boolean,
        concurrency: number,
        branchType: string
    ): Promise<BranchInfo[] | null> {
        if (branches.length === 0) {
            core.info(`No ${branchType} branch to process.`);
            return [];
        }

        core.info(
            `Processing ${branches.length} ${branchType} ${
                branches.length === 1 ? 'branch' : 'branches'
            }${dryRun ? ' (dry run)' : ''}`
        );

        const processedBranches = await pMap(
            branches,
            async (branch) => {
                try {
                    if (archiveStale && !branch.isMerged) {
                        if (dryRun) {
                            core.info(
                                `Would archive branch [${branch.name}] to [refs/tags/archive/${branch.name}]`
                            );
                        } else {
                            const getRefResult =
                                await this.executeWithRateLimitCheck(
                                    `getRef for ${branch.name}`,
                                    async () =>
                                        await this.octokit.rest.git.getRef({
                                            owner: this.owner,
                                            repo: this.repo,
                                            ref: `heads/${branch.name}`,
                                        })
                                );

                            if (getRefResult === null) {
                                return null; // Rate limit reached
                            }

                            const refData = getRefResult.data;

                            const createRefResult =
                                await this.executeWithRateLimitCheck(
                                    `createRef for archive/${branch.name}`,
                                    async () =>
                                        await this.octokit.rest.git.createRef({
                                            owner: this.owner,
                                            repo: this.repo,
                                            ref: `refs/tags/archive/${branch.name}`,
                                            sha: refData.object.sha,
                                        })
                                );

                            if (createRefResult === null) {
                                return null; // Rate limit reached
                            }

                            core.info(
                                `Archived branch [${branch.name}] to [refs/tags/archive/${branch.name}]`
                            );
                        }
                    }

                    if (dryRun) {
                        core.info(`Would delete branch [${branch.name}]`);
                    } else {
                        const deleteRefResult =
                            await this.executeWithRateLimitCheck(
                                `deleteRef for ${branch.name}`,
                                async () =>
                                    await this.octokit.rest.git.deleteRef({
                                        owner: this.owner,
                                        repo: this.repo,
                                        ref: `heads/${branch.name}`,
                                    })
                            );

                        if (deleteRefResult === null) {
                            return null; // Rate limit reached
                        }

                        core.info(`Deleted branch [${branch.name}]`);
                    }

                    return branch;
                } catch (error) {
                    core.warning(
                        `Failed to process branch [${branch.name}]: ${
                            (error as Error).message
                        }`
                    );
                    return null;
                }
            },
            { concurrency }
        );

        // Check if any branch operation returned null due to rate limit
        if (
            processedBranches.some(
                (branch) => branch === null && this.rateLimitService !== null
            )
        ) {
            core.warning(
                'Rate limit threshold reached during branch processing'
            );
            return null;
        }

        // Filter out null values from failed operations
        return processedBranches.filter(
            (branch): branch is BranchInfo => branch !== null
        );
    }
}
