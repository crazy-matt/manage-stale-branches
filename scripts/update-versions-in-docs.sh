#!/bin/bash
set -e

MAJOR="$1"
MINOR="$2"
PATCH="$3"
REPO_FULLNAME="${GITHUB_REPOSITORY:-$4}"
VERSION="${MAJOR}.${MINOR}.${PATCH}"

if [ -f README.md ]; then
  sed -i -E \
    -e "s#(${REPO_FULLNAME}@v)[0-9]+\.[0-9]+\.[0-9]+#\1${VERSION}#g" \
    -e "s#(${REPO_FULLNAME}@v)[0-9]+\.[0-9]+([^.0-9]|$)#\1${MAJOR}.${MINOR}\2#g" \
    -e "s#(${REPO_FULLNAME}@v)[0-9]+([^.0-9]|$)#\1${MAJOR}\2#g" \
    -e "s#latest [0-9]+\.x\.x#latest ${MAJOR}.x.x#g" \
    -e "s#latest [0-9]+\.[0-9]+\.x#latest ${MAJOR}.${MINOR}.x#g" \
    README.md
fi

if [ -f CONTRIBUTING.md ]; then
  sed -i -E \
    -e "s#v[0-9]+\.[0-9]+\.[0-9]+\)#v${VERSION})#g" \
    -e "s#v[0-9]+\.[0-9]+\)#v${MAJOR}.${MINOR})#g" \
    -e "s#v[0-9]+\)#v${MAJOR})#g" \
    CONTRIBUTING.md
fi
