#!/usr/bin/env node
/**
 * 版本号递增脚本
 * 用法: node scripts/version-bump.js [major|minor|patch]
 * 默认: patch
 */

const fs = require('fs')
const path = require('path')

const packagePath = path.join(__dirname, '..', 'package.json')
const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const currentVersion = packageData.version
const [major, minor, patch] = currentVersion.split('.').map(Number)

const bumpType = process.argv[2] || 'patch'
let newVersion

switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`
    break
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`
    break
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`
    break
}

console.log(`Bumping version: ${currentVersion} → ${newVersion}`)

packageData.version = newVersion
fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2) + '\n')

// 更新 README.md 中的版本号
const readmePath = path.join(__dirname, '..', 'README.md')
let readmeContent = fs.readFileSync(readmePath, 'utf8')
readmeContent = readmeContent.replace(
  /Tokscale Floating Monitor-(\d+\.\d+\.\d+)-setup\.exe/g,
  `Tokscale Floating Monitor-${newVersion}-setup.exe`
)
readmeContent = readmeContent.replace(
  /release\/Tokscale Floating Monitor-(\d+\.\d+\.\d+)-setup\.exe/g,
  `release/Tokscale Floating Monitor-${newVersion}-setup.exe`
)
fs.writeFileSync(readmePath, readmeContent)

console.log('Version updated successfully')
console.log('Remember to update CHANGELOG.md if you have one')