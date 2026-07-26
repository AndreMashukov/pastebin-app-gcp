#!/bin/sh
# strip-pastebingcp-deps.sh — remove @pastebingcp/* workspace deps from package.json
# so npm install --omit=dev doesn't try to resolve file:../../libs/... paths that
# don't exist in the runtime image. The @pastebingcp/* dirs are vendored separately
# via COPY in the Dockerfile.
# Uses node (not python3) since node:20-slim doesn't include Python.
set -eu
PKG_FILE="${1:-/app/package.json}"
if [ ! -f "${PKG_FILE}" ]; then
  echo "strip-pastebingcp-deps: ${PKG_FILE} not found" >&2
  exit 1
fi
node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("/app/package.json", "utf8"));
const deps = pkg.dependencies || {};
const removed = Object.keys(deps).filter(k => k.startsWith("@pastebingcp/"));
removed.forEach(k => delete deps[k]);
if (removed.length > 0) {
  pkg.dependencies = deps;
  fs.writeFileSync("/app/package.json", JSON.stringify(pkg, null, 2) + "\n");
  console.log(`strip-pastebingcp-deps: removed ${removed.length} @pastebingcp/* deps: ${removed.join(", ")}`);
} else {
  console.log("strip-pastebingcp-deps: no @pastebingcp/* deps found");
}
'
