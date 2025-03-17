import * as core from '@actions/core';
import * as github from '@actions/github';
import { GithubService } from './services/githubService.ts';
import { parseTimeWithUnit } from './utils/timeParser.ts';
import { generateBranchComparison, generateSummaryMessage } from './utils/branchUtils.ts';
import type { BranchInfo } from './types/BranchInfo.ts';

export async function run(): Promise<void> {
    try {
        const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
        const dryRun: boolean = core.getBooleanInput('dry-run');
        const staleDuration = core.getInput('stale-duration') || '60d';
        const suggestedDuration = core.getInput('suggested-duration') || '30d';
        const archiveStale: boolean = core.getBooleanInput('archive-stale');
        const concurrency = parseInt(core.getInput('concurrency') || '4', 10);
        const excludePatterns = core.getInput('exclude-patterns')
            ? core
                .getInput('exclude-patterns')
                .split(/\r?\n|,/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p) => new RegExp(p))
            : [];

        if (!token) {
            throw new Error(
                'No authentication token found.'
            );
        }

        const staleTime = parseTimeWithUnit(staleDuration, 'stale-duration');
        const suggestedTime = parseTimeWithUnit(suggestedDuration, 'suggested-duration');

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
                (!excludePatterns.length || !excludePatterns.some(regex => regex.test(branch.name)))
        );
        const branchInfos = await Promise.all(
            filteredBranches.map((branch) =>
                githubService.getBranchInfo(defaultBranch, branch.name)
            )
        );

        const now = Date.now();
        const staleCutoff = new Date(now - staleTime);
        const suggestedCutoff = new Date(now - suggestedTime);

        const mergedBranches: BranchInfo[] = [];
        const staleBranches: BranchInfo[] = [];
        const suggestedBranches: BranchInfo[] = [];

        branchInfos.forEach((branch) => {
            core.info(generateBranchComparison(branch, defaultBranch, branch.name))

            if (branch.isMerged) {
                mergedBranches.push(branch);
            } else if (branch.lastCommitDate < staleCutoff) {
                staleBranches.push(branch);
            } else if (branch.lastCommitDate < suggestedCutoff) {
                suggestedBranches.push(branch);
            }
        });

        const processedMergedBranches = await githubService.deleteOrArchiveBranches(
            mergedBranches,
            false,
            dryRun,
            concurrency,
            'merged'
        );

        const processedStaleBranches = await githubService.deleteOrArchiveBranches(
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
        core.setOutput('stale-branches-count', processedStaleBranches.length);
        core.setOutput('suggested-branches-count', suggestedBranches.length);

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
