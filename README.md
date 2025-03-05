# manage-stale-branches

[![Integration](https://github.com/crazy-matt/manage-stale-branches/actions/workflows/integration.yaml/badge.svg)](https://github.com/crazy-matt/manage-stale-branches/actions/workflows/integration.yaml)
[![Tests](https://github.com/crazy-matt/manage-stale-branches/blob/badges/tests.svg)](https://github.com/crazy-matt/manage-stale-branches/actions/workflows/release.yaml)
[![Release](https://github.com/crazy-matt/manage-stale-branches/blob/badges/release.svg)](https://github.com/crazy-matt/manage-stale-branches/actions/workflows/release.yaml)

<div style="display: flex; gap: 2rem;">
<div style="flex: 1;">

This action deletes branches that haven't had a commit in the last `stale-older-than` days, and suggest branches which could be deleted due to their inactivity on the last `suggested-older-than` days.

⚠️ The branches already merged to **default** are automatically deleted if not in `dry-run` mode.

If you set the `dry-run` input to true, the action will simply output a preview of what would be done in no dry run mode.

</div>
<div style="width: min-content;">

<details open="open">
<summary>Table of Contents</summary>

- [manage-stale-branches](#manage-stale-branches)
  - [Using the Action](#using-the-action)
  - [Sample Workflow](#sample-workflow)
  - [Inputs](#inputs)
  - [Outputs](#outputs)

</details>

</div>
</div>

## Using the Action

In your GitHub workflows, you can reference the action by:

```yaml
      - uses: crazy-matt/manage-stale-branches@v2      # Always use the latest 2.x.x
      - uses: crazy-matt/manage-stale-branches@v2.0    # Always use the latest 2.0.x
      - uses: crazy-matt/manage-stale-branches@v2.0.0  # Use this specific version
```

For more information, refer to the [GitHub Actions Quickstart](https://docs.github.com/en/actions/quickstart).

## Sample Workflow

```yaml
on:
  schedule:
    - cron: "0 12 * * 1"  # Run every monday at 12 pm

jobs:
  job1:
    runs-on: ubuntu-latest
    steps:
      - name: Manage Stale Branches
        uses: crazy-matt/manage-stale-branches@v2
        with:
          stale-duration: 60d
          suggested-duration: 30d
          dry-run: true
          archive-stale: true
          excluded-branches: |
            origin/release
```

> you don't need to checkout your repository as this action uses the Github API.

<!-- action-docs-inputs source="action.yaml" -->
## Inputs

| name | description | required | default |
| --- | --- | --- | --- |
| `github-token` | <p>GitHub Token with repository write access.</p> | `false` | `${{ github.token }}` |
| `stale-duration` | <p>Time threshold for stale branches (e.g., "60d", "2w", "1440h"). Accept only a single unit.</p> | `false` | `60d` |
| `suggested-duration` | <p>Time threshold for suggested branches (e.g., "30d", "1w", "720h"). Accept only a single unit.</p> | `false` | `30d` |
| `concurrency` | <p>Number of branches to process concurrently.</p> | `false` | `4` |
| `dry-run` | <p>Run in dry-run mode (no actual deletion).</p> | `false` | `true` |
| `archive-stale` | <p>Archive instead of deleting stale branches.</p> | `false` | `false` |
| `excluded-branches` | <p>Branches to exclude from cleanup.</p> | `false` | `""` |
<!-- action-docs-inputs source="action.yaml" -->

<!-- action-docs-outputs source="action.yaml" -->
## Outputs

| name | description |
| --- | --- |
| `message` | <p>Summary of deleted/suggested branches.</p> |
| `stale-branches` | <p>JSON array string listing the stale branches. Used in dry-run mode, you can pass it easily to a matrix job to handle yourself these branches.</p> |
| `suggested-branches` | <p>JSON array string listing the branches suggested for deletion. Used in dry-run mode, you can pass it easily to a matrix job to handle yourself these branches.</p> |
<!-- action-docs-outputs source="action.yaml" -->
