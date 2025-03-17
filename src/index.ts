import * as core from '@actions/core';
import * as github from '@actions/github';
import createDebug from 'debug';
const debug = createDebug('manage-stale-branches:main');
import type { BranchInfo } from './types/BranchInfo.js';
import { GithubService } from './services/githubService.js';
import {
    generateBranchComparison,
    generateSummaryMessage,
} from './utils/branchUtils.js';
import { parseTimeWithUnit } from './utils/timeParser.js';

export async function run(): Promise<void> {
    try {
        const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
        const dryRun: boolean = core.getBooleanInput('dry-run');
        const staleDuration = core.getInput('stale-duration') || '60d';
        const suggestedDuration = core.getInput('suggested-duration') || '30d';
        const archiveStale: boolean = core.getBooleanInput('archive-stale');
        const concurrency = parseInt(core.getInput('concurrency') || '4', 10);
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
        const filteredBranches = branches.filter(
            (branch) =>
                branch.name !== defaultBranch &&
                (!excludePatterns.length ||
                    !excludePatterns.some((regex) => regex.test(branch.name)))
        );

        const now = Date.now();
        const staleCutoff = new Date(now - staleTime);
        const suggestedCutoff = new Date(now - suggestedTime);
        const branchInfos = await Promise.all(
            filteredBranches.map((branch) =>
                githubService.getBranchInfo(
                    defaultBranch,
                    branch.name,
                    staleCutoff,
                    suggestedCutoff
                )
            )
        );
        branchInfos.forEach((branch) => {
            debug(
                JSON.stringify({
                    name: branch.name,
                    isMerged: branch.isMerged,
                    isStale: branch.isStale,
                    isSuggested: branch.isSuggested,
                    lastCommitDate: branch.lastCommitDate.toISOString(),
                    branchStatus: branch.branchStatus,
                    aheadBy: branch.aheadBy,
                    behindBy: branch.behindBy,
                    staleCutoff: staleCutoff.toISOString(),
                    suggestedCutoff: suggestedCutoff.toISOString(),
                })
            );
        });

        const mergedBranches: BranchInfo[] = [];
        const staleBranches: BranchInfo[] = [];
        const suggestedBranches: BranchInfo[] = [];

        core.info(`Retaining branches:`);
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

        const processedMergedBranches =
            await githubService.deleteOrArchiveBranches(
                mergedBranches,
                false,
                dryRun,
                concurrency,
                'merged'
            );

        const processedStaleBranches =
            await githubService.deleteOrArchiveBranches(
                staleBranches,
                archiveStale,
                dryRun,
                concurrency,
                'stale'
            );

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
