#!/bin/bash
set -e

# Get the version from package.json
VERSION=$(jq -r '.version' package.json)

# Run the build with ncc
yarn ncc build src/index.ts -o dist --source-map

# Update the dist/package.json with the correct version
jq --arg version "$VERSION" '. + {version: $version, name: "manage-stale-branches"}' dist/package.json > dist/package.json.tmp
mv dist/package.json.tmp dist/package.json

echo "Build completed with version: $VERSION"
