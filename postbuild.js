const fs = require("fs-extra");
const path = require("path");

const cjsPackage = path.resolve(__dirname, "dist/cjs/package.json");
const mjsPackage = path.resolve(__dirname, "dist/mjs/package.json");
const wwwTarget = path.join(__dirname, "dist/www");
const wwwSource = path.resolve(__dirname, "www");

fs.writeJsonSync(cjsPackage, { type: "commonjs" });
fs.writeJsonSync(mjsPackage, { type: "module" });

console.log("PKG:", cjsPackage);
console.log("PKG:", mjsPackage);

fs.copySync(wwwSource, wwwTarget);

console.log("WWW:", wwwTarget);
