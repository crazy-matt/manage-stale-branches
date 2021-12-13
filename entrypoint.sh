#!/usr/bin/env bash

[[ "${DRY_RUN}" == true ]] && DRY_RUN_OPT="--dry-run"

git --version

# Only to make it work with GitHub Actions
git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main
echo -e "\nBranches:"
git branch -r -a
echo

# Get default branch
head="$(git branch --no-color -a | grep 'HEAD ->')"
default_branch="${head#*"-> "}"

# Get the branches already merged to the default branch
merged_branches=$(git branch --no-color -r --merged origin/HEAD | grep -v -e "${default_branch}" | sed -e 's/^[[:space:]]*//') # removing leading whitespaces on each line

# Get the branches unmerged to default branch
unmerged_branches=$(git branch --no-color --sort=committerdate -r --no-merged origin/HEAD | sed -e 's/^[[:space:]]*//') # removing leading whitespaces on each line

# Exclude the branches to be excluded from both data set collected above
for branch in $(echo "${EXCLUDED_BRANCHES}" | tr ' ' '\n'); do
  merged_branches=$(echo "${merged_branches}" | sed -e 's/^[[:space:]]*//' | grep -x -v -e "${branch}") # sed to remove leading whitespaces on each line and -x to see the whole line and so avoid a fuzzy match
  unmerged_branches=$(echo "${unmerged_branches}" | sed -e 's/^[[:space:]]*//' | grep -x -v -e "${branch}")
done

if [[ -n "${merged_branches}" ]]; then
  echo -e "\033[0;32mDeleting merged branches...\033[0m"
  for branch in ${merged_branches}; do
    echo git push ${DRY_RUN_OPT} --delete "${branch%%"/"*}" "${branch#*"/"}"
  done
else
  echo 'No merged branches to delete! (squashed branches not detectable here)'
fi

stale_timestamp=$(date -d "now - ${STALE_OLDER_THAN} days" +"%s")
maybe_stale_timestamp=$(date -d "now - ${SUGGESTIONS_OLDER_THAN} days" +"%s")
stale_timestamp_clear_format=$(date -d "now - ${STALE_OLDER_THAN} days")
maybe_stale_timestamp_clear_format=$(date -d "now - ${SUGGESTIONS_OLDER_THAN} days")

# Delete branches with last (cherry picked) commit older than $STALE_OLDER_THAN months
# and suggest deletion when older than $SUGGESTIONS_OLDER_THAN months
echo -e "\n\033[0;32mSearching for stale branches...\033[0m"
echo -e "\033[0;90mBranches created before ${stale_timestamp_clear_format} will be deleted.\033[0m"
echo -e "\033[0;90mBranches created before ${maybe_stale_timestamp_clear_format} will only be suggested for deletion.\033[0m"

branches_to_delete=""
suspected_branches_details=""

# From the branches unmerged to default, judge what is stale and what is to be suggested
for branch in ${unmerged_branches}; do
  last_commit_info=$(git cherry origin/HEAD "${branch}" | grep -v "^-" | cut -d" " -f2 | xargs git show --format="%H;%ct;%cr;%an" --quiet | grep -v "^$(git rev-parse HEAD)" | tail -1)
  last_commit_timestamp=$(echo "${last_commit_info}" | cut -d";" -f2)
  # shellcheck disable=SC2086
  if [ -z "${last_commit_timestamp}" ] || [ ${last_commit_timestamp} -lt ${stale_timestamp} ]; then
    branches_to_delete+="${branch} " # delimiter is whitespace here
  elif [ ${last_commit_timestamp} -lt ${maybe_stale_timestamp} ]; then
    suspected_branches_details+="${branch};${last_commit_info}\n" # delimiter is new line here
  fi
done

branches_to_delete="$(echo -e "${branches_to_delete}" | xargs)" # Removing leading/trailing whitespace
suspected_branches_details="${suspected_branches_details%"\n"}" # Removing trailing new line
suspected_branches_details="${suspected_branches_details#"\n"}" # Removing leading new line

if [ -n "${branches_to_delete}" ]; then
  echo -e "\n\033[0;32mDeleting stale branches older than ${STALE_OLDER_THAN} days (and squashed branches)...\033[0m"
  for branch in ${branches_to_delete}; do
    echo git push ${DRY_RUN_OPT} --delete "${branch%%"/"*}" "${branch#*"/"}"
  done
else
  echo -e 'No stale branches!'
fi

git remote prune $DRY_RUN_OPT origin

if [ -n "${suspected_branches_details}" ]; then
  echo -e "\n\033[1;33mBranches to review (maybe stale, older than ${SUGGESTIONS_OLDER_THAN} days):\033[0m"
  # Format the message block
  NATIVE_IFS=${IFS} && IFS=$'\n'
  for info in $(echo -e "${suspected_branches_details}"); do
    # In awk, each additional character/word needs to be added between double-quotes, even a space
    # '\'' help to escape the quote inside the awk, needs to be added between double-quotes too
    branches_to_review+="$(echo "${info}" | sort -t';' -k5 | awk -F';' 'NF {print "'\''" $5 "'\'' changed branch '\''" $1 "'\'' " $4 }')\n"
  done
  IFS=${NATIVE_IFS}

  branches_to_review="${branches_to_review%"\n"}" # Remove trailing newline
  echo -e "${branches_to_review}"
fi

echo "::set-output name=branches_to_review::$branches_to_review"
