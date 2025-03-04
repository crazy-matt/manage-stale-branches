#!/bin/bash
set -e

MAJOR="$1"
MINOR="$2"
PATCH="$3"
REPO_FULLNAME="${GITHUB_REPOSITORY:-$4}"
VERSION="${MAJOR}.${MINOR}.${PATCH}"
PACKAGE_NAME=$(jq -r '.packages."."."package-name"' .github/release-please-config.json)

# Update README.md
if [ -f README.md ]; then
  # Replace "repo-fullname@vX" with "$REPO_FULLNAME@$MAJOR"
  sed -i -E "s#(${REPO_FULLNAME_ESCAPED}@v)([0-9])(\s|\"|$)#\1${MAJOR}\3#g" README.md
  # Replace "repo-fullname@vX.Y" with "$REPO_FULLNAME@$MAJOR.$MINOR"
  sed -i -E "s#(${REPO_FULLNAME_ESCAPED}@v)([0-9])\.([0-9])(\s|\"|$)#\1${MAJOR}.${MINOR}\4#g" README.md
  # Replace "repo-fullname@vX.Y.Z" with "$REPO_FULLNAME@$MAJOR.$MINOR.$PATCH"
  sed -i -E "s#(${REPO_FULLNAME_ESCAPED}@v)([0-9])\.([0-9])\.([0-9])(\s|\"|$)#\1${VERSION}\5#g" README.md

  # Replace "latest X.x.x" with "latest $MAJOR.x.x"
  sed -i -E "s#latest ([0-9])\.x\.x#latest ${MAJOR}.x.x#g" README.md
  # Replace "latest X.Y.x" with "latest MAJOR.MINOR.x"
  sed -i -E "s#latest ([0-9])\.([0-9])\.x#latest ${MAJOR}.${MINOR}.x#g" README.md
fi

# Update CONTRIBUTING.md
if [ -f CONTRIBUTING.md ]; then
  # Replace vX) with v$MAJOR)
  sed -i -E "s#v([0-9])\)#v${MAJOR})#g" CONTRIBUTING.md
  # Replace vX.Y) with v$MAJOR.$MINOR)
  sed -i -E "s#v([0-9])\.([0-9])\)#v${MAJOR}.${MINOR})#g" CONTRIBUTING.md
  # Replace vX.Y.Z) with v$MAJOR.$MINOR.$PATCH)
  sed -i -E "s#v([0-9])\.([0-9])\.([0-9])\)#v${VERSION})#g" CONTRIBUTING.md
fi
