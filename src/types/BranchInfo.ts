export interface BranchInfo {
    name: string
    isMerged: boolean
    lastCommitDate: Date
    // The comparative status of the head branch to the base branch: "diverged" | "ahead" | "behind" | "identical".
    branchStatus: string
    // How many commits the head branch is ahead of the base branch.
    aheadBy: number
    // How many commits the head branch is behind the base branch.
    behindBy: number
}
