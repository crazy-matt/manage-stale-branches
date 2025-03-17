import styles from 'ansi-styles';
import type { BranchInfo } from '../types/BranchInfo.js';

export function generateBranchComparison(
    branch: BranchInfo,
    base: string,
    head: string
): string {
    // Determine branch color based on status
    let branchColor;
    if (branch.isMerged) {
        branchColor = `${styles.greenBright.open}${head}${styles.greenBright.close}`;
    } else if (branch.isStale) {
        branchColor = `${styles.redBright.open}${head}${styles.redBright.close}`;
    } else if (branch.isSuggested) {
        branchColor = `${styles.yellowBright.open}${head}${styles.yellowBright.close}`;
    }

    // Create the detail message
    let detailMessage = '';
    switch (branch.branchStatus) {
        case 'behind':
            detailMessage = `${head} is ${styles.green.open}behind${styles.green.close} ${base} by ${styles.magenta.open}${branch.behindBy}${styles.magenta.close} commits.`;
            break;
        case 'identical':
            detailMessage = `${head} is ${styles.green.open}identical${styles.green.close} to ${base}.`;
            break;
        case 'diverged':
            detailMessage = `${head} has ${styles.red.open}diverged${styles.red.close} from ${base}, and is ahead by ${styles.magenta.open}${branch.aheadBy}${styles.magenta.close} commits and behind by ${styles.magenta.open}${branch.behindBy}${styles.magenta.close} commits.`;
            break;
        case 'ahead':
            detailMessage = `${head} is ${styles.red.open}ahead${styles.red.close} of ${base} by ${styles.magenta.open}${branch.aheadBy}${styles.magenta.close} commits.`;
            break;
    }

    // Return formatted group with collapsible detail
    return `::group::[${branchColor}]\n${styles.bold.open}${detailMessage}${styles.bold.close}\n::endgroup::`;
}

export function generateSummaryMessage(
    processedMergedBranches: BranchInfo[],
    processedStaleBranches: BranchInfo[],
    suggestedBranches: BranchInfo[]
): string {
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
    return message;
}
