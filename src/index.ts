import * as core from '@actions/core';
import * as github from '@actions/github';
import pMap from 'p-map';

interface BranchInfo {
    name: string;
    isMerged: boolean;
    lastCommitDate: Date;
}

async function deleteOrArchiveBranches(
    octokit: any,
    owner: string,
    repo: string,
    branches: BranchInfo[],
    archiveStale: boolean,
    dryRun: boolean,
    concurrency: number,
    branchType: string
): Promise<BranchInfo[]> {
    // Add return type
    if (branches.length === 0) {
        core.info(`No ${branchType} branch to process.`);
        return [];
    }

    core.info(`Processing branches: ${branches.map((b) => b.name).join(', ')}`);

    if (dryRun) {
        core.info(
            'Dry-run mode enabled. No branches will be deleted or archived.'
        );
        return branches; // Return all branches in dry-run mode
    }

    const successfulBranches: BranchInfo[] = [];

    await pMap(
        branches,
        async (branch) => {
            try {
                if (archiveStale && !branch.isMerged) {
                    core.info(`Archiving branch ${branch.name}...`);
                    const { data: refData } = await octokit.rest.git.getRef({
                        owner,
                        repo,
                        ref: `heads/${branch.name}`,
                    });

                    await octokit.rest.git.createRef({
                        owner,
                        repo,
                        ref: `refs/tags/archive/${branch.name}`,
                        sha: refData.object.sha,
                    });
                }

                core.info(`Deleting branch ${branch.name}...`);
                await octokit.rest.git.deleteRef({
                    owner,
                    repo,
                    ref: `heads/${branch.name}`,
                });

                core.info(`Successfully processed branch ${branch.name}`);
                successfulBranches.push(branch);
            } catch (error) {
                core.warning(
                    `Failed to process branch ${branch.name}: ${(error as Error).message}`
                );
            }
        },
        { concurrency }
    );

    return successfulBranches;
}

async function getBranchInfo(
    octokit: any,
    owner: string,
    repo: string,
    defaultBranch: string,
    branchName: string
): Promise<BranchInfo> {
    // Get the last commit date
    const { data: commit } = await octokit.rest.repos.getCommit({
        owner,
        repo,
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

    // Check if the branch is merged into the default branch
    let isMerged = false;
    try {
        const {
            data: { status },
        } = await octokit.rest.repos.compareCommits({
            owner,
            repo,
            base: defaultBranch,
            head: branchName,
        });
        isMerged = status === 'identical' || status === 'behind';
    } catch (error) {
        core.warning(
            `Failed to check merge status for ${branchName}: ${(error as Error).message}`
        );
    }

    return {
        name: branchName,
        isMerged,
        lastCommitDate: new Date(commitDate),
    };
}

function parseTimeWithUnit(input: string, paramName: string): number {
    const trimmed = input.trim();
    const match = trimmed.match(/^(-?\d+)\s*([hdw])$/i);

    if (!match) {
        throw new Error(`Invalid format for ${paramName}`);
    }

    const [, value, unit] = match;
    const numValue = parseInt(value, 10);

    if (numValue <= 0) {
        throw new Error(
            `Invalid format for ${paramName}: value must be positive`
        );
    }

    // Convert everything to hours for better precision
    switch (unit.toLowerCase()) {
        case 'h':
            return numValue;
        case 'd':
            return numValue * 24; // days to hours
        case 'w':
            return numValue * 24 * 7; // weeks to hours
        default:
            throw new Error(
                `Invalid format for ${paramName}: unknown unit '${unit}'`
            );
    }
}

export async function run(): Promise<void> {
    try {
        const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;

        if (!token) {
            throw new Error(
                'No authentication token found. Either provide the github-token input or ensure GITHUB_TOKEN environment variable is available.'
            );
        }

        const staleDuration = core.getInput('stale-duration') || '60d';
        const suggestedDuration = core.getInput('suggested-duration') || '30d';

        const staleHours = parseTimeWithUnit(staleDuration, 'stale-duration');
        const suggestedHours = parseTimeWithUnit(
            suggestedDuration,
            'suggested-duration'
        );

        const dryRun: boolean = core.getBooleanInput('dry-run');
        const archiveStale: boolean = core.getBooleanInput('archive-stale');
        const excludedBranches: string[] = core.getInput('excluded-branches')
            ? core
                  .getInput('excluded-branches')
                  .split(/\r?\n|,/)
                  .map((b) => b.trim())
                  .filter(Boolean)
            : [];
        const concurrency: number = Number(core.getInput('concurrency')) || 4;

        const octokit = github.getOctokit(token);
        const { owner, repo } = github.context.repo;

        // Get the default branch name
        const { data: repoInfo } = await octokit.rest.repos.get({
            owner,
            repo,
        });
        const defaultBranch = repoInfo.default_branch;

        core.info(`Fetching branches from ${owner}/${repo}...`);
        const { data: branches } = await octokit.rest.repos.listBranches({
            owner,
            repo,
        });

        const now = Date.now();
        const staleBranches: BranchInfo[] = [];
        const suggestedBranches: BranchInfo[] = [];
        const mergedBranches: BranchInfo[] = [];

        // Process each branch
        for (const branch of branches) {
            if (
                branch.name === defaultBranch ||
                excludedBranches.includes(branch.name)
            ) {
                continue;
            }

            try {
                const branchInfo = await getBranchInfo(
                    octokit,
                    owner,
                    repo,
                    defaultBranch,
                    branch.name
                );
                const hoursOld = Math.floor(
                    (now - branchInfo.lastCommitDate.getTime()) /
                        (1000 * 60 * 60) // Convert ms to hours
                );

                if (branchInfo.isMerged) {
                    mergedBranches.push(branchInfo);
                } else if (hoursOld > staleHours) {
                    staleBranches.push(branchInfo);
                } else if (hoursOld > suggestedHours) {
                    suggestedBranches.push(branchInfo);
                }
            } catch (error) {
                core.warning(
                    `Skipping branch ${branch.name} due to error: ${(error as Error).message}`
                );
            }
        }

        // Process merged branches first (they should always be deleted)
        const processedMergedBranches = await deleteOrArchiveBranches(
            octokit,
            owner,
            repo,
            mergedBranches,
            false,
            dryRun,
            concurrency,
            'merged'
        );

        // Process stale branches
        const processedStaleBranches = await deleteOrArchiveBranches(
            octokit,
            owner,
            repo,
            staleBranches,
            archiveStale,
            dryRun,
            concurrency,
            'stale'
        );

        // Generate summary message using only successfully processed branches
        let message = '';
        if (processedMergedBranches.length > 0) {
            message += `Deleted merged branches: ${processedMergedBranches.map((b) => b.name).join(', ')}\n`;
        }
        if (processedStaleBranches.length > 0) {
            message += `Deleted stale branches: ${processedStaleBranches.map((b) => b.name).join(', ')}\n`;
        }
        if (suggestedBranches.length > 0) {
            message += `Suggested stale branches: ${suggestedBranches.map((b) => b.name).join(', ')}\n`;
        }

        // Set all outputs
        core.info(message);
        core.setOutput('message', message);

        // Using JSON.stringify to create proper JSON array strings
        core.setOutput(
            'stale-branches',
            JSON.stringify(
                [...mergedBranches, ...staleBranches].map((b) => b.name)
            )
        );
        core.setOutput(
            'suggested-branches',
            JSON.stringify(suggestedBranches.map((b) => b.name))
        );
    } catch (error) {
        core.setFailed((error as Error).message);
    }
}

run();
