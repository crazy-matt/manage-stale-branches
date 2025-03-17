import type { BranchInfo } from '../types/BranchInfo.ts';
import styles from 'ansi-styles';

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

export function generateBranchComparison(branch: BranchInfo, base: string, head: string): string {
  let message: string;
  message = `${styles.bold.open}${head} has a status of [${branch.branchStatus}] in comparison to ${base}. ${head} is ahead by ${branch.aheadBy} commits and behind by ${branch.behindBy} commits.${styles.bold.close}`;
  switch (branch.branchStatus) {
    case 'diverged':
      message = `${styles.bold.open}${head} has ${styles.red.open}diverged${styles.red.close} from ${base}, and is ahead by ${styles.magenta.open}${branch.aheadBy}${styles.magenta.close} commits and behind by ${styles.magenta.open}${branch.behindBy}${styles.magenta.close} commits.${styles.bold.close}`;
      break;
    case 'ahead':
      message = `${styles.bold.open}${head} is ${styles.yellow.open}ahead${styles.yellow.close} of ${base} by ${styles.magenta.open}${branch.aheadBy}${styles.magenta.close} commits.${styles.bold.close}`;
      break;
    case 'behind':
      message = `${styles.bold.open}${head} is ${styles.yellow.open}behind${styles.yellow.close} ${base} by ${styles.magenta.open}${branch.behindBy}${styles.magenta.close} commits.${styles.bold.close}`;
      break;
    case 'identical':
      message = `${styles.bold.open}${head} is ${styles.green.open}identical${styles.green.close} to ${base}.${styles.bold.close}`;
      break;
  }
  return message;
}
