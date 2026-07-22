#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const aiDir = path.join(repoRoot, '.ai')
const logsDir = path.join(aiDir, 'logs')
const repoProfilePath = path.join(aiDir, 'repo-profile.json')
const contractPath = path.join(aiDir, 'validation-contract.json')
const statePath = path.join(aiDir, 'loop-state.json')

fs.mkdirSync(aiDir, { recursive: true })
fs.mkdirSync(logsDir, { recursive: true })

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function getPackageManager() {
  const lockfiles = [
    { name: 'pnpm', file: 'pnpm-lock.yaml' },
    { name: 'yarn', file: 'yarn.lock' },
    { name: 'npm', file: 'package-lock.json' },
  ]
  for (const candidate of lockfiles) {
    if (fs.existsSync(path.join(repoRoot, candidate.file))) {
      return candidate.name
    }
  }
  return 'npm'
}

function getCommandRunner(pm) {
  const isWindows = process.platform === 'win32'
  if (pm === 'pnpm') return isWindows ? 'pnpm.cmd' : 'pnpm'
  if (pm === 'yarn') return isWindows ? 'yarn.cmd' : 'yarn'
  return isWindows ? 'npm.cmd' : 'npm'
}

function getInstallCommand(pm) {
  if (pm === 'pnpm') return ['install']
  if (pm === 'yarn') return ['install']
  return ['ci']
}

function getScriptCommand(pm, scriptName) {
  return [pm === 'npm' ? 'run' : 'run', scriptName]
}

function getPackageLockHash() {
  const lockFile = path.join(repoRoot, 'package-lock.json')
  if (!fs.existsSync(lockFile)) return null
  return crypto.createHash('sha256').update(fs.readFileSync(lockFile, 'utf8')).digest('hex')
}

function shouldInstallDependencies(statePackageLockHash, packageLockHash) {
  if (!fs.existsSync(path.join(repoRoot, 'node_modules'))) return true
  if (statePackageLockHash !== packageLockHash) return true
  const binDir = path.join(repoRoot, 'node_modules', '.bin')
  if (!fs.existsSync(binDir)) return true
  const expectedBins = ['oxlint', 'vitest', 'vite', 'tsc']
  return expectedBins.some((bin) => !fs.existsSync(path.join(binDir, bin)) && !fs.existsSync(path.join(binDir, `${bin}.cmd`)))
}

function getChangedFiles() {
  const result = spawnSync('git', ['status', '--short'], { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) return []
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\S+\s+/, ''))
}

function sanitizeFileName(name) {
  return name.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase()
}

function runCommand(command, args, label) {
  const logFile = path.join(logsDir, `${sanitizeFileName(label)}.log`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
  if (result.error) {
    fs.writeFileSync(logFile, `${result.error.message}\n`, 'utf8')
    return { result, output: result.error.message, logFile }
  }
  fs.writeFileSync(logFile, output, 'utf8')
  return { result, output, logFile }
}

function compactFailureExcerpt(output, maxLines) {
  const lines = output.split(/\r?\n/).filter((line) => line.trim())
  const tail = lines.slice(-Math.max(1, maxLines))
  return tail.join('\n')
}

function extractFingerprint(commandName, output) {
  const normalized = output.replace(/\\r/g, '').trim()
  const firstMeaningfulLine = normalized
    .split(/\n/)
    .find((line) => /error|failed|exception|typeerror|referenceerror|syntaxerror|ts[0-9]+/i.test(line)) || normalized.split(/\n/)[0] || 'no-output'
  const repoFileMatch = normalized.match(/(?:^|\s)(package\.json|package-lock\.json|vite\.config\.ts|tsconfig(?:\.app|\.node)?\.json|src\/[^:\s]+)/i)
  const filePath = repoFileMatch ? repoFileMatch[1] : 'unknown'
  const errorTypeMatch = normalized.match(/(TypeError|ReferenceError|SyntaxError|Error|TS[0-9]+)/i)
  const errorType = errorTypeMatch ? errorTypeMatch[1] : 'failure'
  return `${commandName}:${errorType}:${filePath}:${firstMeaningfulLine.slice(0, 120)}`
}

function inferInspectFiles(output) {
  const repoFiles = ['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'src/App.tsx', 'src/main.tsx', 'src/setupTests.ts']
  const matches = new Set()
  for (const file of repoFiles) {
    if (output.includes(file)) matches.add(file)
  }
  const lines = output.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/(?:^|\s)(package\.json|package-lock\.json|vite\.config\.ts|tsconfig(?:\.app|\.node)?\.json|src\/[^:\s]+)/i)
    if (match) matches.add(match[1])
  }
  return Array.from(matches).slice(0, 5)
}

function updateState(stateUpdate) {
  const existing = readJson(statePath)
  const next = { ...existing, ...stateUpdate }
  writeJson(statePath, next)
  return next
}

function main() {
  const repoProfile = readJson(repoProfilePath)
  const contract = readJson(contractPath)
  let state = readJson(statePath)
  const pm = getPackageManager()
  const runner = getCommandRunner(pm)
  const iteration = (state.iteration || 0) + 1
  const changedFiles = getChangedFiles()
  const packageLockHash = getPackageLockHash()

  const needsInstall = shouldInstallDependencies(state.packageLockHash, packageLockHash)
  const validations = [
    { id: 'lint', label: 'lint', command: runner, args: getScriptCommand(pm, 'lint') },
    { id: 'test', label: 'test', command: runner, args: getScriptCommand(pm, 'test') },
    { id: 'build', label: 'build', command: runner, args: getScriptCommand(pm, 'build') },
  ]

  if (needsInstall) {
    const installArgs = getInstallCommand(pm)
    const installLabel = 'install'
    console.log(`Running ${installLabel} (${pm})...`)
    const installRun = runCommand(runner, installArgs, installLabel)
    if (installRun.result.status !== 0) {
      const excerpt = compactFailureExcerpt(installRun.output, contract.maxLogLinesToRetainPerFailingCommand)
      const fingerprint = extractFingerprint('install', installRun.output)
      updateState({
        iteration,
        phase: 'blocked',
        lastFailingCommand: 'install',
        failureFingerprint: fingerprint,
        changedFiles,
        remainingRiskAreas: ['dependency installation', 'registry availability'],
        lastSuccessfulValidationCommand: state.lastSuccessfulValidationCommand,
        finalStatus: 'fail',
        packageLockHash,
        failureExcerpt: excerpt,
        inspectFiles: inferInspectFiles(installRun.output),
      })
      console.log(`FAIL install :: ${fingerprint}`)
      process.exit(1)
    }
    console.log('PASS install')
  } else {
    console.log('SKIP install')
  }

  for (const step of validations) {
    console.log(`Running ${step.label}...`)
    const run = runCommand(step.command, step.args, step.label)
    if (run.result.status !== 0) {
      const excerpt = compactFailureExcerpt(run.output, contract.maxLogLinesToRetainPerFailingCommand)
      const fingerprint = extractFingerprint(step.id, run.output)
      updateState({
        iteration,
        phase: 'failing',
        lastFailingCommand: step.id,
        failureFingerprint: fingerprint,
        changedFiles,
        remainingRiskAreas: [step.id, 'inspect current failure root cause'],
        lastSuccessfulValidationCommand: state.lastSuccessfulValidationCommand,
        finalStatus: 'fail',
        packageLockHash,
        failureExcerpt: excerpt,
        inspectFiles: inferInspectFiles(run.output),
      })
      console.log(`FAIL ${step.label} :: ${fingerprint}`)
      process.exit(1)
    }
    state = updateState({
      iteration,
      phase: 'validating',
      lastFailingCommand: null,
      failureFingerprint: null,
      changedFiles,
      remainingRiskAreas: ['none'],
      lastSuccessfulValidationCommand: step.id,
      finalStatus: 'pending',
      packageLockHash,
      failureExcerpt: null,
      inspectFiles: [],
    })
    console.log(`PASS ${step.label}`)
  }

  updateState({
    iteration,
    phase: 'validated',
    lastFailingCommand: null,
    failureFingerprint: null,
    changedFiles: getChangedFiles(),
    remainingRiskAreas: [],
    lastSuccessfulValidationCommand: validations[validations.length - 1].id,
    finalStatus: 'pass',
    packageLockHash,
    failureExcerpt: null,
    inspectFiles: [],
  })

  console.log(`PASS all validations :: next command: ${runner} run ai:harness`)
}

main()
