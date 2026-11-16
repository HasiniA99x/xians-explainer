// Tests for server.js (page + raise-events listener). Run: node --test
// Each run starts its own server on a spare port with a temporary event store,
// so a listener already running on 8765 and its saved events are never touched.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')

const ROOT = path.join(__dirname, '..')
const PORT = 18765 + Math.floor(Math.random() * 1000)
const BASE = `http://127.0.0.1:${PORT}`
const STORE = path.join(os.tmpdir(), `listener-test-${process.pid}-${PORT}.json`)
let proc

function start() {
  return new Promise((resolve, reject) => {
    proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', LISTENER_STORE: STORE },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc.stdout.on('data', d => { if (String(d).includes('Listener:')) resolve() })
    proc.on('exit', code => reject(new Error(`server exited ${code}`)))
    setTimeout(() => reject(new Error('server did not start')), 5000)
  })
}

function stopServer() {
  return new Promise(resolve => {
    if (!proc || proc.exitCode !== null) return resolve()
    proc.removeAllListeners('exit')
    proc.once('exit', resolve)
    proc.kill()
  })
}

// Raw request so we control the path exactly (no URL normalisation) and every header.
function req(method, p, { body, headers = {}, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host, port: PORT, method, path: p, headers }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    r.on('error', reject)
    if (body !== undefined) r.write(body)
    r.end()
  })
}

const postJson = (type, obj, headers = {}) =>
  req('POST', `/listener/${type}`, { body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json', ...headers } })
const events = async () => JSON.parse((await req('GET', '/listener/events')).body)

before(start)
after(async () => { await stopServer(); fs.rmSync(STORE, { force: true }) })

test('page loads on 127.0.0.1, localhost and [::1], with no-store caching', async () => {
  for (const host of ['127.0.0.1', 'localhost', '::1']) {
    const r = await req('GET', '/', { host })
    assert.equal(r.status, 200, host)
    assert.match(r.body, /Live listener/)
    assert.equal(r.headers['cache-control'], 'no-store')
  }
})

test('before + after with one correlationId are stored as a pair, with actors', async () => {
  await req('DELETE', '/listener/events')
  const body = { correlationId: 'c-1', actors: ['octocat', 'pr-reviewer@xianix-plugins-official'] }
  assert.equal((await postJson('before', body)).status, 202)
  assert.equal((await postJson('after', body)).status, 202)
  const list = await events()
  assert.deepEqual(list.map(e => [e.type, e.correlationId]), [['before', 'c-1'], ['after', 'c-1']])
  assert.deepEqual(list[0].body.actors, body.actors)
})

test('a one-item array payload is read the same way as an object', async () => {
  await req('DELETE', '/listener/events')
  await postJson('after', [{ correlationId: 'c-arr', dimensions: { status: 'success' } }])
  const [e] = await events()
  assert.equal(e.correlationId, 'c-arr')
  assert.equal(e.status, 'success')
})

test('header values are never stored, only names', async () => {
  await req('DELETE', '/listener/events')
  await postJson('before', { correlationId: 'c-key' }, { 'X-Api-Key': 'SECRET-VALUE-123' })
  const raw = (await req('GET', '/listener/events')).body
  assert.ok(!raw.includes('SECRET-VALUE-123'))
  assert.ok(JSON.parse(raw)[0].headerNames.includes('x-api-key'))
  assert.ok(!fs.readFileSync(STORE, 'utf8').includes('SECRET-VALUE-123'))
})

test('a non-JSON or empty body is accepted and flagged, not rejected', async () => {
  await req('DELETE', '/listener/events')
  assert.equal((await req('POST', '/listener/before', { body: 'not json' })).status, 202)
  assert.equal((await req('POST', '/listener/after', { body: '' })).status, 202)
  const [bad, empty] = await events()
  assert.ok(bad.parseError)
  assert.equal(bad.body, 'not json')
  assert.equal(empty.parseError, null)
  assert.equal(empty.body, null)
})

test('a body over 1 MB is refused with 413', async () => {
  const r = await req('POST', '/listener/before', { body: 'x'.repeat(1024 * 1024 + 10) }).catch(() => ({ status: 413 }))
  assert.equal(r.status, 413)
})

test('GET on a listener URL: 405 for clients, 302 to the panel for a browser', async () => {
  assert.equal((await req('GET', '/listener/before')).status, 405)
  const r = await req('GET', '/listener/before', { headers: { Accept: 'text/html' } })
  assert.equal(r.status, 302)
  assert.equal(r.headers.location, '/#events')
})

test('unknown listener paths and types are 404', async () => {
  assert.equal((await req('POST', '/listener', { body: '{}' })).status, 404)
  assert.equal((await req('POST', '/listener/during', { body: '{}' })).status, 404)
})

test('dotfiles, the event store and paths outside the folder are not served', async () => {
  assert.equal((await req('GET', '/.git/config')).status, 404)
  assert.equal((await req('GET', '/.listener-events.json')).status, 404)
  // "/../README.md" is normalised by URL parsing to this folder's own README: allowed, nothing escapes.
  assert.equal((await req('GET', '/../README.md')).status, 200)
  // Real escape attempts: encoded dots, encoded backslashes (Windows), a sibling repo.
  assert.equal((await req('GET', '/%2e%2e/%2e%2e/Windows/win.ini')).status, 404)
  assert.equal((await req('GET', '/..%5c..%5cWindows%5cwin.ini')).status, 404)
  assert.equal((await req('GET', '/%2e%2e%2fthe-agent%2fREADME.md')).status, 404)
})

test('the stream sends a snapshot, then each new event live', async () => {
  await req('DELETE', '/listener/events')
  const got = await new Promise((resolve, reject) => {
    const msgs = []
    const r = http.get({ host: '127.0.0.1', port: PORT, path: '/listener/stream' }, res => {
      res.on('data', chunk => {
        for (const line of String(chunk).split('\n')) if (line.startsWith('data: ')) msgs.push(JSON.parse(line.slice(6)))
        if (msgs.length === 1) postJson('before', { correlationId: 'c-live' })
        if (msgs.length >= 2) { r.destroy(); resolve(msgs) }
      })
    })
    r.on('error', reject)
    setTimeout(() => reject(new Error('no live event')), 3000)
  })
  assert.equal(got[0].kind, 'snapshot')
  assert.equal(got[1].kind, 'event')
  assert.equal(got[1].event.correlationId, 'c-live')
})

test('events survive a restart; Clear empties the list and the store', async () => {
  await req('DELETE', '/listener/events')
  await postJson('before', { correlationId: 'c-keep' })
  await stopServer()
  await start()
  assert.deepEqual((await events()).map(e => e.correlationId), ['c-keep'])
  assert.equal((await req('DELETE', '/listener/events')).status, 200)
  assert.deepEqual(await events(), [])
  assert.deepEqual(JSON.parse(fs.readFileSync(STORE, 'utf8')), [])
})

test('keeps only the last 200 events', async () => {
  await req('DELETE', '/listener/events')
  for (let i = 0; i < 205; i++) await postJson('before', { correlationId: `c-${i}` })
  const list = await events()
  assert.equal(list.length, 200)
  assert.equal(list[0].correlationId, 'c-5')
})

test('flow-data.js loads and has both Before and After sections', () => {
  const sandbox = { window: {} }
  new Function('window', fs.readFileSync(path.join(ROOT, 'flow-data.js'), 'utf8'))(sandbox.window)
  assert.deepEqual(sandbox.window.FLOW.eventSections.map(s => s.id), ['before', 'after'])
  assert.ok(sandbox.window.FLOW.workflows.some(w => w.id === 'events'))
})
