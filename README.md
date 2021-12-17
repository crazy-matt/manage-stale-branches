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
<!-- action-docs-inputs -->

<!-- action-docs-outputs -->
<!-- action-docs-outputs -->
