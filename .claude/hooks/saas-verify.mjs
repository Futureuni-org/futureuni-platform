#!/usr/bin/env node
// saas-verify: a Claude Code hook that runs lint and typecheck once Claude finishes editing.
//
// PostToolUse (Edit|Write|MultiEdit): records each code file Claude changes in this session.
// Stop: runs the project's own lint and typecheck in every package that owns a changed file.
//   All green: clears the record, and Claude stops normally.
//   Failures:  exits 2, so the errors go back to Claude and it keeps working to fix them.
//   It gives up after MAX_ATTEMPTS blocked stops in a row, so it can never loop forever.
//
// No dependencies. Needs Node 18+. Works with npm, pnpm, yarn, and bun, on Windows, macOS, and Linux.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const MAX_ATTEMPTS = 3
const OUTPUT_LIMIT = 4000 // characters of output per failing check sent back to Claude
const TIME_BUDGET_MS = 540_000 // stays under the Stop hook's 600s timeout in settings.json
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.json'])
const IGNORED_DIRS = new Set(['node_modules', '.next', '.turbo', '.git', 'dist', 'build', 'out', 'coverage'])
const TYPECHECK_SCRIPTS = ['typecheck', 'type-check', 'check-types']
const LOCKFILES = [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['package-lock.json', 'npm']]
const MISSING_COMMAND = /is not recognized as an internal or external command|command not found|sh: \d+: \S+: not found|Command "\S+" not found/

const input = readInput()
const projectDir = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd())
const stateDir = join(tmpdir(), 'claude-saas-verify', String(input.session_id || 'default').replace(/[^\w-]/g, '_'))
const filesDir = join(stateDir, 'files')
const attemptsFile = join(stateDir, 'attempts')

try {
  if (input.hook_event_name === 'PostToolUse') recordEdit()
  if (input.hook_event_name === 'Stop') verify()
} catch (error) {
  // A bug in this hook must never trap Claude. Exit 1 is a non-blocking error.
  process.stderr.write(`saas-verify hook error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return {}
  }
}

function recordEdit() {
  const filePath = input.tool_input?.file_path
  if (typeof filePath !== 'string') return
  const file = resolve(input.cwd || projectDir, filePath)
  if (!isInsideProject(file) || !CODE_EXTENSIONS.has(extname(file).toLowerCase())) return
  if (relative(projectDir, file).split(sep).some((part) => IGNORED_DIRS.has(part))) return
  // One marker file per edited file, so parallel edits never overwrite each other's record.
  mkdirSync(filesDir, { recursive: true })
  writeFileSync(join(filesDir, createHash('sha1').update(file).digest('hex')), file)
}

function verify() {
  const files = readEditedFiles()
  if (files.length === 0) return

  // stop_hook_active is true when Claude is still going because this hook blocked it last time.
  let attempts = input.stop_hook_active ? Number(readText(attemptsFile)) || 0 : 0
  if (attempts >= MAX_ATTEMPTS) {
    clearState()
    return
  }

  const deadline = Date.now() + TIME_BUDGET_MS
  const roots = [...new Set(files.map(findPackageRoot).filter((root) => root !== null))]
  const failures = []
  for (const root of roots) {
    for (const check of checksFor(root)) {
      const result = run(check.command, root, deadline)
      if (result.status === 'fail') failures.push({ ...check, root, output: result.output })
      if (result.status === 'skipped') process.stderr.write(`saas-verify: skipped ${check.name} in ${displayPath(root)} (${result.reason})\n`)
    }
  }

  if (failures.length === 0) {
    clearState()
    return
  }

  attempts += 1
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(attemptsFile, String(attempts))
  process.stderr.write(formatFailures(failures, attempts))
  process.exit(2)
}

function readEditedFiles() {
  if (!existsSync(filesDir)) return []
  return readdirSync(filesDir).map((name) => readText(join(filesDir, name))).filter(Boolean)
}

function findPackageRoot(file) {
  for (let dir = dirname(file); isInsideProject(dir); dir = dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir
    if (dirname(dir) === dir) break
  }
  return null
}

function checksFor(root) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  } catch {
    return []
  }
  const scripts = pkg.scripts ?? {}
  const pm = packageManager(root, pkg)
  const checks = []
  if (scripts.lint) checks.push({ name: 'lint', command: `${pm} run lint` })

  const typecheckScript = TYPECHECK_SCRIPTS.find((name) => scripts[name])
  if (typecheckScript) {
    checks.push({ name: 'typecheck', command: `${pm} run ${typecheckScript}` })
  } else if (existsSync(join(root, 'tsconfig.json'))) {
    const tsc = resolveTsc(root)
    if (tsc) checks.push({ name: 'typecheck', label: 'tsc --noEmit', command: `${quote(process.execPath)} ${quote(tsc)} --noEmit --pretty false` })
  }
  return checks
}

function packageManager(root, pkg) {
  const declared = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : ''
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(declared)) return declared
  for (let dir = root; isInsideProject(dir); dir = dirname(dir)) {
    const match = LOCKFILES.find(([lockfile]) => existsSync(join(dir, lockfile)))
    if (match) return match[1]
    if (dirname(dir) === dir) break
  }
  return 'npm'
}

function resolveTsc(root) {
  try {
    return createRequire(join(root, 'package.json')).resolve('typescript/bin/tsc')
  } catch {
    return null
  }
}

function run(command, cwd, deadline) {
  const timeout = deadline - Date.now()
  if (timeout < 5_000) return { status: 'skipped', reason: 'out of time' }
  const result = spawnSync(command, {
    cwd,
    shell: true, // needed for npm.cmd / pnpm.cmd on Windows
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], // no stdin, so nothing can wait on an interactive prompt
    windowsHide: true,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
  })
  if (result.error?.code === 'ETIMEDOUT' || result.signal) return { status: 'skipped', reason: 'timed out' }
  if (result.status === 0) return { status: 'pass' }
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()
  // A missing tool or missing node_modules is an environment problem Claude can't fix by editing code.
  if (result.status === 127 || MISSING_COMMAND.test(output)) return { status: 'skipped', reason: 'command not available' }
  return { status: 'fail', output }
}

function formatFailures(failures, attempt) {
  const lines = [
    `saas-verify: checks failed after your edits (automatic check ${attempt} of ${MAX_ATTEMPTS}).`,
    'Fix the root cause of each error below, then finish your reply. Never suppress errors: no @ts-ignore, eslint-disable, `any`, or loosened config.',
    'If an error is pre-existing and unrelated to your change, leave it alone and name it in your reply instead of rewriting unrelated code.',
  ]
  if (attempt === MAX_ATTEMPTS) lines.push('This is the last automatic check. If anything still fails, tell the user exactly which errors remain and why.')
  for (const failure of failures) {
    const output = failure.output.length > OUTPUT_LIMIT
      ? `${failure.output.slice(0, OUTPUT_LIMIT)}\n… ${failure.output.length - OUTPUT_LIMIT} more characters. Run the command yourself for the full output.`
      : failure.output
    lines.push('', `## ${failure.name}: \`${failure.label ?? failure.command}\` in ${displayPath(failure.root)}`, output || '(no output; the command exited with an error)')
  }
  return `${lines.join('\n')}\n`
}

function isInsideProject(path) {
  const rel = relative(projectDir, path)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}

function displayPath(dir) {
  return relative(projectDir, dir) || '.'
}

function quote(value) {
  return `"${value}"`
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

function clearState() {
  rmSync(stateDir, { recursive: true, force: true })
}
