#!/usr/bin/env -S node
import fs from 'node:fs/promises'
import path from 'node:path'
import semver from 'semver'

const NpmPackageName = '@createiq/swagger-ui-scss'

const StagedPackagePath = path.join(process.cwd(), 'tmp', 'swagger-ui-scss')
const StagedPackageJsonPath = path.join(StagedPackagePath, 'package.json')

const MinimumStyleSheets = 10
const MinimumPluginStyleSheets = 5

const RequiredFiles = ['LICENSE', 'README.md', 'SECURITY.md', 'style/main.scss']

const failures: string[] = []

function check(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✔ ${message}`)
  } else {
    console.log(`  ✘ ${message}`)
    failures.push(message)
  }
}

async function isNonEmptyFile(file: string) {
  try {
    const stats = await fs.stat(path.join(StagedPackagePath, file))
    return stats.isFile() && stats.size > 0
  } catch {
    return false
  }
}

async function countFiles(directory: string, extension: string) {
  try {
    const entries = await fs.readdir(path.join(StagedPackagePath, directory), { recursive: true })
    return entries.filter(entry => entry.endsWith(extension)).length
  } catch {
    return 0
  }
}

console.log(`Verifying the staged package at ${StagedPackagePath}`)

for (const file of RequiredFiles) {
  check(await isNonEmptyFile(file), `${file} exists and is not empty`)
}

const styleSheets = await countFiles('style', '.scss')
check(
  styleSheets >= MinimumStyleSheets,
  `style contains at least ${MinimumStyleSheets} SCSS files (found ${styleSheets})`
)

const pluginStyleSheets = await countFiles('core', 'css')
check(
  pluginStyleSheets >= MinimumPluginStyleSheets,
  `core contains at least ${MinimumPluginStyleSheets} plugin stylesheets (found ${pluginStyleSheets})`
)

try {
  const staged = JSON.parse(await fs.readFile(StagedPackageJsonPath, 'utf-8'))

  check(staged.name === NpmPackageName, `package name is ${NpmPackageName} (found ${staged.name})`)
  check(semver.valid(staged.version) !== null, `package version is a valid semver (found ${staged.version})`)
  check(staged.main === './style/main.scss', `package main is ./style/main.scss (found ${staged.main})`)
  check(Boolean(staged.license), `package declares a license (found ${staged.license})`)
  check(
    Boolean(staged.dependencies?.['tachyons-sass']),
    `package depends on tachyons-sass (found ${staged.dependencies?.['tachyons-sass']})`
  )
} catch (e) {
  check(false, `package.json is readable and valid JSON (${e instanceof Error ? e.message : e})`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:`)
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exit(1)
}

console.log('\nStaged package looks good')
