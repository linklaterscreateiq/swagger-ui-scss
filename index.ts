#!/usr/bin/env -S npx tsx
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { PathLike } from 'node:fs'
import npmFetch from 'npm-registry-fetch'
import ora, { type Ora } from 'ora'
import semver from 'semver'
import { simpleGit } from 'simple-git'

const RepositoryUrl = 'https://github.com/linklaterscreateiq/swagger-ui-scss'
const ReadmeFile = 'README.md'
const LocalReadmePath = path.join(process.cwd(), ReadmeFile)

const NpmPackageName = '@createiq/swagger-ui-scss'

const TempDir = path.join(process.cwd(), 'tmp')

const UpstreamGitRepositoryUrl = 'https://github.com/swagger-api/swagger-ui.git'
const SwaggerUiPath = path.join(TempDir, 'swagger-ui')
const SwaggerUiPackagePath = path.join(SwaggerUiPath, 'package.json')

const StagedPackagePath = path.join(TempDir, 'swagger-ui-scss')
const StagedPackageJsonPath = path.join(StagedPackagePath, 'package.json')
const StagedReadmePath = path.join(StagedPackagePath, ReadmeFile)

const git = simpleGit()

type AsyncTask<T> = (spinner: Ora) => Promise<T>

async function asyncTask<T>(title: string, task: AsyncTask<T>) {
  const spinner = ora(title).start()

  const result = await task(spinner)
  if (spinner.isSpinning) {
    spinner.succeed()
  }

  return result
}

const [latestTagName, taggedVersion] = await asyncTask('Get latest tag from upstream', async spinner => {
  const listText = await git.listRemote(['--tags', '--sort=-v:refname', UpstreamGitRepositoryUrl])
  const listTags = (listText.match(/[^\r\n]+/g) ?? [])
    .map(s => s.replace(/^.*refs\/tags\//, ''))
    .filter(s => semver.valid(s.substring(1))) // check valid version
    .filter(s => /^v[0-9]+\.[0-9]+\.[0-9]+$/.test(s)) // skip -a, -h, -i, +deno etc
  const latestTagName = listTags[0]
  const taggedVersion = latestTagName.substring(1)

  if (!latestTagName) {
    spinner.fail(`Invalid version ${latestTagName}`)
    process.exit(1)
  }

  spinner.suffixText = `- git effective latest tag name = ${latestTagName}, tagged version = ${taggedVersion}`

  return [latestTagName, taggedVersion]
})

type NpmRegistryResponse = {
  'dist-tags': {
    latest?: string
  }
}

const npmPackageVersion = await asyncTask('Get package version from npm registry', async spinner => {
  try {
    const npmRegistryInfo = (await npmFetch.json(`/${NpmPackageName}`)) as NpmRegistryResponse

    const npmPackageVersion = npmRegistryInfo?.['dist-tags']?.latest?.split('-')[0]
    if (npmPackageVersion) {
      spinner.suffixText = `- Success, npm version = ${npmPackageVersion}`
      return npmPackageVersion
    }

    spinner.warn('Failed to get a version. The package may not have been published yet')
  } catch (e) {
    if (e instanceof Error) {
      spinner.warn(`Failed to get a version: ${e.message}. The package may not have been published yet`)
    } else {
      spinner.warn('Failed to get a version. The package may not have been published yet')
    }
  }
})

await asyncTask('Checking versions', async spinner => {
  if (taggedVersion === npmPackageVersion) {
    spinner.info('Versions are the same, no publishing required')
    process.exit(1)
  }

  if (npmPackageVersion && semver.lt(taggedVersion, npmPackageVersion)) {
    spinner.fail('Version in the git repository is lower than the version in npm, no publishing required')
    process.exit(1)
  }

  spinner.suffixText = `- Ready to publish version ${taggedVersion} as gt ${npmPackageVersion}`
})

await asyncTask('Cloning the swagger-ui repository', async spinner => {
  try {
    const stats = await fs.stat(TempDir)
    if (stats.isDirectory()) {
      spinner.suffixText = '- Deleting old clone'
      await fs.rm(TempDir, { force: true, recursive: true })
    } else {
      spinner.fail(`Existing temp dir at ${TempDir} is not a directory`)
      process.exit(1)
    }
  } catch {
    // Ignore
  }

  spinner.suffixText = `- Cloning ${UpstreamGitRepositoryUrl}`
  await git.clone(UpstreamGitRepositoryUrl, SwaggerUiPath, ['--depth', '1', '--branch', latestTagName])
})

await asyncTask('Creating swagger-ui-scss version to push', async spinner => {
  await fs.mkdir(StagedPackagePath)

  spinner.suffixText = ' - Copying SCSS files'
  await fs.cp(path.join(SwaggerUiPath, 'src/style'), path.join(StagedPackagePath, 'style'), { recursive: true })

  spinner.suffixText = ' - Copying core dependencies'
  await fs.cp(path.join(SwaggerUiPath, 'src/core'), path.join(StagedPackagePath, 'core'), {
    recursive: true,
    async filter(source: string) {
      if ((await fs.stat(source)).isDirectory()) {
        const directoryContainsMatchingFile = async (dir: string) => {
          const files = await fs.readdir(dir, { recursive: true })

          for (const file of files) {
            const filePath = path.join(dir, file)

            if ((await fs.stat(filePath)).isDirectory()) {
              if (await directoryContainsMatchingFile(filePath)) {
                return true
              }
            } else {
              const relativePath = path.relative(SwaggerUiPath, filePath)
              if (relativePath.startsWith('src/core/plugins') && relativePath.endsWith('css')) {
                return true
              }
            }
          }

          return false
        }

        return await directoryContainsMatchingFile(source)
      }

      const relativeSource = path.relative(SwaggerUiPath, source)
      return relativeSource.startsWith('src/core/plugins') && relativeSource.endsWith('css')
    },
  })

  spinner.suffixText = ' - Copying LICENSE'
  await fs.cp(path.join(SwaggerUiPath, 'LICENSE'), path.join(StagedPackagePath, 'LICENSE'), { recursive: true })

  spinner.suffixText = ' - Copying SECURITY.md'
  await fs.cp(path.join(SwaggerUiPath, 'SECURITY.md'), path.join(StagedPackagePath, 'SECURITY.md'), { recursive: true })

  spinner.suffixText = ' - Copying README.md'
  await fs.cp(LocalReadmePath, StagedReadmePath, { recursive: true })

  spinner.suffixText = ' - Creating package.json'
  const gitPackageFileContent = JSON.parse(await fs.readFile(SwaggerUiPackagePath, 'utf-8'))
  const packageContent = {
    name: NpmPackageName,
    version: gitPackageFileContent.version,
    main: './style/main.scss',
    homepage: gitPackageFileContent.homepage,
    repository: { type: 'git', url: `git+${RepositoryUrl}` },
    contributors: [...gitPackageFileContent.contributors, 'Mathew Mannion <mathew.mannion@linklaters.com>'],
    license: gitPackageFileContent.license,
    dependencies: {
      'tachyons-sass': gitPackageFileContent.devDependencies['tachyons-sass'],
    },
  }
  await fs.writeFile(StagedPackageJsonPath, JSON.stringify(packageContent, undefined, 2), 'utf-8')

  spinner.suffixText = ' - Installing dependencies'
  const child = spawn('npm i', {
    cwd: StagedPackagePath,
  })
  await new Promise<void>((resolve, reject) => {
    child.stdout.on('data', x => {
      process.stdout.write(x.toString())
    })
    child.stderr.on('data', x => {
      process.stderr.write(x.toString())
    })

    child.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Failed to install dependencies, exited with status ${code}`))
      }
    })
  })

  spinner.suffixText = ' - Done'
})
