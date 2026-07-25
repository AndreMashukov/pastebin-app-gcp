#!/bin/sh
# Strip @pastebingcp/* deps from a package.json so npm install doesn't fail
# on unresolved file: paths. Preserve all other manifest fields.
node -e '
  const fs = require("fs");
  const orig = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const stripWorkspace = (deps = {}) => Object.fromEntries(
    Object.entries(deps).filter(([k]) => !k.startsWith("@pastebingcp/"))
  );
  const next = {
    ...orig,
    dependencies: stripWorkspace(orig.dependencies),
  };
  if (orig.optionalDependencies) {
    next.optionalDependencies = stripWorkspace(orig.optionalDependencies);
  }
  if (orig.devDependencies) {
    next.devDependencies = stripWorkspace(orig.devDependencies);
  }
  if (orig.peerDependencies) {
    next.peerDependencies = stripWorkspace(orig.peerDependencies);
  }
  fs.writeFileSync("package.json", JSON.stringify(next, null, 2) + "\n");
'
