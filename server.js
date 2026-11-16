#!/usr/bin/env node
/*
 * Serves the explainer and acts as a raise-events listener. No dependencies.
 *
 *   node server.js            → http://127.0.0.1:8765
 *   PORT=9000 node server.js
 *
 * Listener endpoints (point a rules.json raise-event `url` here):
 *   POST /listener/before     a `type: "before"` event (run starting)
 *   POST /listener/after      a `type: "after"` event (run finished)
 *   GET  /listener/events     every event received so far (newest last)
 *   GET  /listener/stream     the same, live, as Server-Sent Events
 *   DELETE /listener/events   clear the list
 *
 * Events (last 200) are kept in .listener-events.json, so a restart keeps them. Header values are never stored or shown,
 * only header names, so an API key sent by mistake does not end up on the page.
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = Number(process.env.PORT) || 8765
const HOST = process.env.HOST || '127.0.0.1'
const ROOT = __dirname
const MAX_EVENTS = 200
const MAX_BODY = 1024 * 1024

const TYPES = new Set(['before', 'after'])
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

// Events are saved here so a server restart keeps them. A dotfile, so it is never served.
const STORE = process.env.LISTENER_STORE || path.join(ROOT, '.listener-events.json')

function loadEvents() {
  try {
    const saved = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    return Array.isArray(saved) ? saved.slice(-MAX_EVENTS) : []
  } catch { return [] }
}

function saveEvents() {
  try { fs.writeFileSync(STORE, JSON.stringify(events)) } catch (e) { console.warn(`[listener] could not save events: ${e.message}`) }
}

const events = loadEvents()
const clients = new Set()

function send(res, status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers })
  res.end(text)
}

function broadcast(msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`
  for (const c of clients) c.write(line)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function receive(req, res, type) {
  let raw
  try { raw = await readBody(req) } catch (e) { return send(res, e.status || 400, { error: e.message }) }

  let body = null
  let parseError = null
  if (raw.trim()) {
    try { body = JSON.parse(raw) } catch (e) { parseError = e.message }
  }
  // The agent's payload may be an object or a one-item array; read the correlation ID from either.
  const first = Array.isArray(body) ? body[0] : body
  const correlationId = first && typeof first === 'object' ? first.correlationId || null : null

  const event = {
    id: crypto.randomUUID(),
    type,
    receivedAt: new Date().toISOString(),
    correlationId,
    status: first && typeof first === 'object' ? first.status || first.dimensions?.status || null : null,
    headerNames: Object.keys(req.headers).filter(h => !['host', 'connection', 'content-length'].includes(h)),
    body: parseError ? raw.slice(0, 4000) : body,
    parseError,
  }
  events.push(event)
  if (events.length > MAX_EVENTS) events.shift()
  saveEvents()
  broadcast({ kind: 'event', event })
  console.log(`[listener] ${type} ${correlationId || '(no correlationId)'}${parseError ? ' (body is not JSON)' : ''}`)

  // 2xx so the agent does not retry. Answer fast: a before event holds up the run until it gets this.
  send(res, 202, { received: true, id: event.id })
}

function stream(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.write(`data: ${JSON.stringify({ kind: 'snapshot', events })}\n\n`)
  clients.add(res)
  const ping = setInterval(() => res.write(': ping\n\n'), 25000)
  req.on('close', () => { clearInterval(ping); clients.delete(res) })
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
  const file = path.resolve(ROOT, rel)
  // Only files inside this folder, and never dotfiles (.git).
  if (!file.startsWith(ROOT + path.sep) || rel.split(/[\\/]/).some(p => p.startsWith('.'))) {
    return send(res, 404, { error: 'Not found' })
  }
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' })
    // no-store: a refresh always picks up edited page files.
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(data)
  })
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const m = pathname.match(/^\/listener\/([a-z]+)\/?$/)
  // A browser opening a listener URL (not the page's own fetch/EventSource) goes to the live panel instead.
  const fromBrowser = req.method === 'GET' && (req.headers.accept || '').includes('text/html')

  if (pathname.startsWith('/listener') && fromBrowser) {
    res.writeHead(302, { Location: '/#events' })
    return res.end()
  }

  if (m && TYPES.has(m[1])) {
    if (req.method !== 'POST') {
      console.log(`[listener] 405 ${req.method} ${pathname}`)
      return send(res, 405, { error: 'Use POST' }, { Allow: 'POST' })
    }
    return receive(req, res, m[1])
  }
  if (pathname === '/listener/events') {
    if (req.method === 'GET') return send(res, 200, events)
    if (req.method === 'DELETE') {
      events.length = 0
      saveEvents()
      broadcast({ kind: 'cleared' })
      return send(res, 200, { cleared: true })
    }
    return send(res, 405, { error: 'Use GET or DELETE' }, { Allow: 'GET, DELETE' })
  }
  if (pathname === '/listener/stream' && req.method === 'GET') return stream(req, res)
  if (pathname.startsWith('/listener')) {
    console.log(`[listener] 404 ${req.method} ${pathname}`)
    return send(res, 404, { error: `Unknown listener path ${req.method} ${pathname}. POST to /listener/before or /listener/after.` })
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' })
  return serveStatic(req, res, pathname)
})

server.listen(PORT, HOST, () => {
  const base = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`
  console.log(`Explainer:  ${base}/#events   (also http://localhost:${PORT}/#events)`)
  console.log(`Listener:   POST ${base}/listener/before  ·  POST ${base}/listener/after`)
  if (events.length) console.log(`[listener] loaded ${events.length} saved event(s)`)
})

// "localhost" can resolve to IPv6 (::1) first, so on the default host also listen there.
// Still loopback only: nothing on the network can reach either address.
if (HOST === '127.0.0.1') {
  http.createServer(server.listeners('request')[0])
    .on('error', e => console.warn(`[listener] not listening on [::1]:${PORT} (${e.code})`))
    .listen(PORT, '::1')
}
