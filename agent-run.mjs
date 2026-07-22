#!/usr/bin/env node
/*
 * agent-run.mjs — run your agent and auto-record its cost.
 *
 *   node agent-run.mjs --model <model>     e.g.  --model gpt-5.3-codex
 *   node agent-run.mjs --check             verify your setup + login, run nothing
 *
 * It runs GitHub Copilot (CLI) with a FIXED prompt, using YOUR harness files
 * (.github/copilot-instructions.md etc.) and YOUR chosen model, then:
 *   • adds the run's exact AI-credit cost to COST.txt (your cumulative total), and
 *   • checks your engine compiles.
 * All your competitive edge lives in your harness files + model choice — not the prompt.
 *
 * ── ONE-TIME SETUP (before the session) ────────────────────────────────────
 *   1) npm install -g @github/copilot
 *   2) copilot            → sign in with the GitHub account that HAS your Copilot
 *                           license (your work account — NOT a personal one)
 *   3) node agent-run.mjs --check
 * (If your terminal can't find `copilot`, this wrapper still locates it in the
 *  npm global folder — but you'll need `copilot` on PATH to sign in the first time.)
 */
import { spawn, spawnSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const COST_FILE = join(HERE, 'COST.txt')

const STD_PROMPT =
  'Implement the promotion and pricing engine at src/pricing/engine.ts, exported as ' +
  'priceOrder. The authoritative spec is SPEC.md — but if the repository instructions ' +
  'designate a distilled spec or reading list, follow that instead of re-reading everything. ' +
  'Build only that file. Do not write or run tests.'

// ---- args: --model <name>, --check. Reject anything else (teaches the lesson). ----
const argv = process.argv.slice(2)
let model = process.env.COPILOT_MODEL || null
let checkOnly = false
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--model') model = argv[++i]
  else if (argv[i] === '--check') checkOnly = true
  else {
    console.error(`Unexpected argument: "${argv[i]}"`)
    console.error('The prompt is standardized — put your guidance in .github/copilot-instructions.md, not the command line.')
    console.error('Usage: node agent-run.mjs [--model <name>] [--check]')
    process.exit(1)
  }
}

// ---- locate copilot: on PATH, else in the npm global folder (common on Windows) ----
function resolveCopilot() {
  const onPath = spawnSync('copilot', ['--version'], { shell: true, encoding: 'utf8' })
  if (!onPath.error && onPath.status === 0) return 'copilot'
  const candidates = []
  try { candidates.push(execSync('npm config get prefix', { encoding: 'utf8' }).trim()) } catch {}
  if (process.env.APPDATA) candidates.push(join(process.env.APPDATA, 'npm'))
  for (const dir of candidates) {
    for (const name of ['copilot.cmd', 'copilot']) {
      const p = join(dir, name)
      if (existsSync(p)) return p
    }
  }
  return null
}
const COPILOT = resolveCopilot()
if (!COPILOT) {
  console.error('✗ Copilot CLI not found.\n  Install once:  npm install -g @github/copilot\n' +
    '  then run:      copilot   → sign in with your WORK GitHub account (the one with Copilot).')
  process.exit(1)
}
if (checkOnly) {
  console.log(`✓ Copilot CLI found: ${COPILOT}`)
  console.log('  Final check: run  copilot -p "hello"  — you should see an "AI Credits …" line.')
  console.log('  No line = an account without Copilot access; sign in again with  copilot.')
  process.exit(0)
}

const before = existsSync(COST_FILE) ? Number((readFileSync(COST_FILE, 'utf8').match(/[\d.]+/) || [0])[0]) || 0 : 0
const q = (s) => `"${String(s).replace(/"/g, "'")}"`
const args = ['-p', q(STD_PROMPT), '--allow-all-tools', '--no-color']
if (model) args.push('--model', q(model))

let out = ''
const child = spawn(q(COPILOT), args, { cwd: HERE, stdio: ['inherit', 'pipe', 'pipe'], shell: true })
child.stdout.on('data', (d) => { process.stdout.write(d); out += d })
child.stderr.on('data', (d) => { process.stderr.write(d); out += d })
child.on('close', () => {
  const m = out.match(/AI Credits\s+([\d.]+)/i)
  const run = m ? Number(m[1]) : 0
  const total = Math.round((before + run) * 100) / 100
  writeFileSync(COST_FILE, `${total}\n`)

  const tsc = spawnSync('npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit'], { cwd: HERE, shell: true, encoding: 'utf8' })
  const compiles = tsc.status === 0

  console.log('\n──────── agent-run ────────')
  console.log(`compiles:    ${compiles ? '✓ yes' : '✗ NO — fix before submitting'}`)
  if (!compiles) console.log((tsc.stdout || '') + (tsc.stderr || ''))
  console.log(`this run:    ${run} credits`)
  console.log(`total cost:  ${total} credits   → saved to COST.txt`)
  if (!m) console.log('(!) no "AI Credits" line — you may not be signed in. Run  copilot  and sign in with your Copilot account.')
})
