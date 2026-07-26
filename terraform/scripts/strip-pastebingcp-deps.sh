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
PKG_FILE="$PKG_FILE" node -e '
const fs = require("fs");
const pkgFile = process.env.PKG_FILE;
const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
const stripWorkspace = (deps = {}) => Object.fromEntries(
  Object.entries(deps).filter(([k]) => !k.startsWith("@pastebingcp/"))
);
const removed = Object.keys(pkg.dependencies || {}).filter(k => k.startsWith("@pastebingcp/"));
pkg.dependencies = stripWorkspace(pkg.dependencies);
if (pkg.optionalDependencies) pkg.optionalDependencies = stripWorkspace(pkg.optionalDependencies);
if (pkg.peerDependencies) pkg.peerDependencies = stripWorkspace(pkg.peerDependencies);
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");
if (removed.length > 0) {
  console.log(`strip-pastebingcp-deps: removed ${removed.length} @pastebingcp/* deps: ${removed.join(", ")}`);
} else {
  console.log("strip-pastebingcp-deps: no @pastebingcp/* deps found");
}
'
