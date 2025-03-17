import * as core from '@actions/core';
import pMap from 'p-map';
import type { BranchInfo } from '../types/BranchInfo.ts';

export class GithubService {
    constructor(
        private octokit: any,
        private owner: string,
        private repo: string
    ) {}

    async getBranchInfo(
        defaultBranch: string,
        branchName: string
    ): Promise<BranchInfo> {
        // Get the last commit date
        const { data: commit } = await this.octokit.rest.repos.getCommit({
            owner: this.owner,
            repo: this.repo,
            ref: branchName,
        });

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
        let branchStatus = '';
        let aheadBy = 0;
        let behindBy = 0;

        try {
            // Compare branch with default branch
            const basehead = `heads/${defaultBranch}...heads/${branchName}`;
            const { data: comparison } =
                await this.octokit.rest.repos.compareCommitsWithBasehead({
                    owner: this.owner,
                    repo: this.repo,
                    basehead,
                });

            // Update comparison values
            branchStatus = comparison.status;
            aheadBy = comparison.ahead_by;
            behindBy = comparison.behind_by;

            // A branch is considered merged if it's identical or behind the default branch
            isMerged =
                comparison.status === 'identical' ||
                comparison.status === 'behind';

            core.debug(
                `Branch ${branchName} comparison: status=${branchStatus}, ` +
                    `ahead=${aheadBy}, behind=${behindBy}, merged=${isMerged}`
            );
        } catch (error) {
            core.warning(
                `Failed to check comparison status for ${branchName}: ${(error as Error).message}`
            );
        }

        return {
            name: branchName,
            isMerged,
            lastCommitDate: new Date(commitDate),
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
    ): Promise<BranchInfo[]> {
        if (branches.length === 0) {
            core.info(`No ${branchType} branch to process.`);
            return [];
        }

        if (dryRun) {
            core.info(
                'Dry-run mode enabled. No branches will be deleted or archived.'
            );
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
                                `[DRY RUN] Would archive branch ${branch.name} to refs/tags/archive/${branch.name}`
                            );
                        } else {
                            const { data: refData } =
                                await this.octokit.rest.git.getRef({
                                    owner: this.owner,
                                    repo: this.repo,
                                    ref: `heads/${branch.name}`,
                                });

                            await this.octokit.rest.git.createRef({
                                owner: this.owner,
                                repo: this.repo,
                                ref: `refs/tags/archive/${branch.name}`,
                                sha: refData.object.sha,
                            });

                            core.info(
                                `Archived branch ${branch.name} to refs/tags/archive/${branch.name}`
                            );
                        }
                    }

                    if (dryRun) {
                        core.info(
                            `[DRY RUN] Would delete branch ${branch.name}`
                        );
                    } else {
                        await this.octokit.rest.git.deleteRef({
                            owner: this.owner,
                            repo: this.repo,
                            ref: `heads/${branch.name}`,
                        });
                        core.info(`Deleted branch ${branch.name}`);
                    }

                    return branch;
                } catch (error) {
                    core.warning(
                        `Failed to process branch ${branch.name}: ${
                            (error as Error).message
                        }`
                    );
                    return null;
                }
            },
            { concurrency }
        );

        // Filter out null values from failed operations
        return processedBranches.filter(
            (branch): branch is BranchInfo => branch !== null
        );
    }
}
