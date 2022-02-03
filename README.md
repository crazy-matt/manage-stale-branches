# Manage Stale Branches

[![Vulnerability](https://github.com/crazy-matt/manage-stale-branches/actions/workflows/security_scanner.yml/badge.svg)](https://github.com/crazy-matt/manage-stale-branches/actions/workflows/security_scanner.yml) [![Linting](https://github.com/crazy-matt/manage-stale-branches/actions/workflows/linter.yml/badge.svg)](https://github.com/crazy-matt/manage-stale-branches/actions/workflows/linter.yml)

This action deletes branches that haven't had a commit in the last `stale_older_than` days, and suggest branches which could be deleted due to their inactivity on the last `suggestions_older_than` days.

⚠️ The branches already merged to **default** are automatically deleted.

If you set the `dry_run` input to true, the action will just output a preview of what would be done in no dry run mode.

<details open="open">
<summary>Table of Contents</summary>

- [Manage Stale Branches](#manage-stale-branches)
  - [Requirements](#requirements)
  - [Sample Workflow](#sample-workflow)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [License](#license)

</details>

## Requirements

Create a workflow `.yml` file in your `.github/workflows` directory. An example is available below.

For more information, refer to the [GitHub Actions Quickstart](https://docs.github.com/en/actions/quickstart).

## Sample Workflow

```yaml
on:
  schedule:
    # Run every monday at 12 pm
    - cron: "0 12 * * 1"

jobs:
  cleanup_branches:
    name: "Branch Cleaner"
    runs-on: ubuntu-latest
    steps:
      - name: "Manage Stale Branches"
        id: branch_cleaner
        uses: crazy-matt/manage-stale-branches@1.0.0
        with:
          gh_token: ${{ secrets.GITHUB_TOKEN }}
          stale_older_than: 60
          suggestions_older_than: 30
          dry_run: true
          archive_stale: true
          excluded_branches: |
            origin/main
            origin/master
```

> you don't need to use a checkout action

<!-- action-docs-inputs -->
## Inputs

| parameter | description | required | default |
| - | - | - | - |
| gh_token | Provide the GITHUB_TOKEN secret to be used for cloning and branch deletions. Needs read/write access on your repository, so passing the secrets.GITHUB_TOKEN is recommended as set by default with read/write by GitHub. | `true` |  |
| stale_older_than | Number of days after which branches are deleted if not merged in any branch | `false` | 60 |
| suggestions_older_than | Number of days after which branches are suggested for deletion if not merged in any branch | `false` | 30 |
| dry_run | Run the action in dry-run mode to let you visualise the changes before going live | `false` |  |
| archive_stale | Instead of deleting the branches declared stale, the action will archive them creating a tag "archive/[branch name]".
You can later unarchive them running "git checkout -b [branch name] refs/tags/archive/[branch name].
 | `false` |  |
| excluded_branches | List the branches you want to exclude from the cleanup process | `false` |  |



<!-- action-docs-inputs -->

<!-- action-docs-outputs -->
## Outputs

| parameter | description |
| - | - |
| message | Summarize the outcome of the cleanup process in a nice message mentioning deleted branches and suggestions (merged branches deleted are not mentioned) |



<!-- action-docs-outputs -->

## License

Licensed under the [Apache License 2.0](LICENSE)
