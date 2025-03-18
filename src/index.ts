import * as core from '@actions/core';
import * as github from '@actions/github';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import createDebug from 'debug';
const debug = createDebug('manage-stale-branches:main');
import type { BranchInfo } from './types/BranchInfo.js';
import { GithubService } from './services/githubService.js';
import { RateLimitService } from './services/rateLimitService.js';
import {
    generateBranchComparison,
    generateSummaryMessage,
} from './utils/branchUtils.js';
import { parseTimeWithUnit } from './utils/timeParser.js';

// Response types for GitHub API calls
type RepoGetResponse = RestEndpointMethodTypes['repos']['get']['response'];
type BranchesListResponse =
    RestEndpointMethodTypes['repos']['listBranches']['response'];

export async function run(): Promise<void> {
    try {
        const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
        const dryRun: boolean = core.getBooleanInput('dry-run');
        const staleDuration = core.getInput('stale-duration') || '60d';
        const suggestedDuration = core.getInput('suggested-duration') || '30d';
        const archiveStale: boolean = core.getBooleanInput('archive-stale');
        const concurrency = parseInt(core.getInput('concurrency') || '4', 10);
        const rateLimitThreshold = parseInt(
            core.getInput('rate-limit-threshold') || '95',
            10
        );
        const excludePatterns: RegExp[] = core.getInput('exclude-patterns')
            ? core
                  .getInput('exclude-patterns')
                  .split(/\r?\n|,/)
                  .map((p: string) => p.trim())
                  .filter(Boolean)
                  .map((p: string) => {
                      try {
                          return new RegExp(p);
                      } catch {
                          core.warning(`Invalid regex pattern: ${p}`);
                          return null;
                      }
                  })
                  .filter((pattern): pattern is RegExp => pattern !== null)
            : [];

        if (!token) {
            throw new Error('No authentication token found.');
        }

        const staleTime = parseTimeWithUnit(staleDuration, 'stale-duration');
        const suggestedTime = parseTimeWithUnit(
            suggestedDuration,
            'suggested-duration'
        );

        const octokit = github.getOctokit(token);
        const { owner, repo } = github.context.repo;
        const githubService = new GithubService(octokit, owner, repo);
        const rateLimitService = new RateLimitService(
            octokit,
            rateLimitThreshold
        );

        // Initial check of rate limit
        const isBelowThreshold = await rateLimitService.checkRateLimit();
        if (!isBelowThreshold) {
            core.warning(
                'Rate limit threshold already reached before starting processing. Exiting early.'
            );
            return;
        }

        const getRepoOp = rateLimitService.withRateLimitCheck<RepoGetResponse>(
            'get repository info'
        );
        const repoResult = await getRepoOp(async () => {
            return await octokit.rest.repos.get({
                owner,
                repo,
            });
        });

        if (!repoResult) {
            core.warning('Exiting due to rate limit threshold being reached.');
            return;
        }

        const defaultBranch = repoResult.data.default_branch;

        core.info(`Fetching branches from ${owner}/${repo}...`);
        const listBranchesOp =
            rateLimitService.withRateLimitCheck<BranchesListResponse>(
                'list branches'
            );
        const branchesResult = await listBranchesOp(async () => {
            return await octokit.rest.repos.listBranches({
                owner,
                repo,
            });
        });

        if (!branchesResult) {
            core.warning('Exiting due to rate limit threshold being reached.');
            return;
        }

        const branches = branchesResult.data;
        const filteredBranches = branches.filter(
            (branch) =>
                branch.name !== defaultBranch &&
                (!excludePatterns.length ||
                    !excludePatterns.some((regex) => regex.test(branch.name)))
        );

        const now = Date.now();
        const staleCutoff = new Date(now - staleTime);
        const suggestedCutoff = new Date(now - suggestedTime);

        // Process branches with rate limiting
        const branchInfos: BranchInfo[] = [];
        for (const branch of filteredBranches) {
            const getBranchInfoOp =
                rateLimitService.withRateLimitCheck<BranchInfo>(
                    `get branch info for ${branch.name}`
                );
            const branchInfo = await getBranchInfoOp(async () => {
                return await githubService.getBranchInfo(
                    defaultBranch,
                    branch.name,
                    staleCutoff,
                    suggestedCutoff
                );
            });

            if (!branchInfo) {
                core.warning(
                    'Exiting due to rate limit threshold being reached.'
                );
                return;
            }

            branchInfos.push(branchInfo);

            debug(
                JSON.stringify({
                    name: branchInfo.name,
                    isMerged: branchInfo.isMerged,
                    isStale: branchInfo.isStale,
                    isSuggested: branchInfo.isSuggested,
                    lastCommitDate: branchInfo.lastCommitDate.toISOString(),
                    branchStatus: branchInfo.branchStatus,
                    aheadBy: branchInfo.aheadBy,
                    behindBy: branchInfo.behindBy,
                    staleCutoff: staleCutoff.toISOString(),
                    suggestedCutoff: suggestedCutoff.toISOString(),
                })
            );
        }

        const mergedBranches: BranchInfo[] = [];
        const staleBranches: BranchInfo[] = [];
        const suggestedBranches: BranchInfo[] = [];

        core.info(
            `Processing the following ${branchInfos.length} branches out of ${branches.length}:`
        );
        branchInfos.forEach((branch) => {
            core.info(
                generateBranchComparison(branch, defaultBranch, branch.name)
            );

            if (branch.isMerged) {
                mergedBranches.push(branch);
            } else if (branch.isStale) {
                staleBranches.push(branch);
            } else if (branch.isSuggested) {
                suggestedBranches.push(branch);
            }
        });

        if (dryRun) {
            core.info(
                'Dry-run mode enabled. No branches will be deleted or archived.'
            );
        }

        // Update GithubService to use our rate limit checker
        githubService.setRateLimitService(rateLimitService);

        const processedMergedBranches =
            await githubService.deleteOrArchiveBranches(
                mergedBranches,
                false,
                dryRun,
                concurrency,
                'merged'
            );

        // Check if we hit the rate limit during merged branch processing
        if (processedMergedBranches === null) {
            core.warning(
                'Rate limit threshold reached during merged branch processing. Stopping further operations.'
            );
            return;
        }

        const processedStaleBranches =
            await githubService.deleteOrArchiveBranches(
                staleBranches,
                archiveStale,
                dryRun,
                concurrency,
                'stale'
            );

        // Check if we hit the rate limit during stale branch processing
        if (processedStaleBranches === null) {
            core.warning(
                'Rate limit threshold reached during stale branch processing. Stopping further operations.'
            );
            return;
        }

        const message = generateSummaryMessage(
            processedMergedBranches,
            processedStaleBranches,
            suggestedBranches
        );

        if (message) {
            core.info(message);
            core.setOutput('summary', message);
        }

        core.setOutput('merged-branches-count', processedMergedBranches.length);
        core.setOutput(
            'merged-branches',
            JSON.stringify(processedMergedBranches.map((b) => b.name))
        );

        core.setOutput('stale-branches-count', processedStaleBranches.length);
        core.setOutput(
            'stale-branches',
            JSON.stringify(processedStaleBranches.map((b) => b.name))
        );

        core.setOutput('suggested-branches-count', suggestedBranches.length);
        core.setOutput(
            'suggested-branches',
            JSON.stringify(suggestedBranches.map((b) => b.name))
        );
    } catch (error) {
        core.setFailed((error as Error).message);
    }
}

run();
