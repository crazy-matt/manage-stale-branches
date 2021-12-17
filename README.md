# Manage Stale Branches

This action deletes branches that haven't had a commit in the last `stale_older_than` days, and suggest branches which could be deleted due to their inactivity on the last `suggestions_older_than` days.

⚠️ The branches already merged to **default** are automatically deleted.

If you set the `dry_run` input to true, the action will just output a preview of what would be done in no dry run mode.

## Requirements

None

## Sample Workflow

```yaml
steps:
  - name: "Manage Stale Branches"
    uses: crazy-matt/manage-stale-branches@v1
    with:
      gh_token: ${{ secrets.GITHUB_TOKEN }}
      stale_older_than: 90
      suggestions_older_than: 30
      dry_run: true
      excluded_branches: |
        origin/main
        origin/master
        origin/develop
```

> you don't need to use a checkout action

<!-- action-docs-inputs -->
## Inputs

| parameter | description | required | default |
| - | - | - | - |
| gh_token | Provide the GITHUB_TOKEN secret to be used for cloning and branch deletions. Needs read/write access on your repository, so passing the secrets.GITHUB_TOKEN is recommended as set by default with read/write by GitHub. | `true` |  |
| stale_older_than | Number of days after which branches are deleted if not merged in any branch | `false` | 90 |
| suggestions_older_than | Number of days after which branches are suggested for deletion if not merged in any branch | `false` | 45 |
| dry_run | Run the action in dry-run mode to let you visualise the changes before going live | `false` |  |
| excluded_branches | List the branches you want to exclude from the cleanup process | `false` |  |



<!-- action-docs-inputs -->

<!-- action-docs-outputs -->
## Outputs

| parameter | description |
| - | - |
| message | Summarize the outcome of the cleanup process in a nice message mentioning deleted branches and suggestions (merged branches deleted are not mentioned) |



<!-- action-docs-outputs -->
