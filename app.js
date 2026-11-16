/* Draws the workflow tabs, the step flow and the detail card from window.FLOW. No dependencies. */
(function () {
  const F = window.FLOW
  const $ = sel => document.querySelector(sel)
  const state = { wf: F.workflows[0], index: 0, timer: null }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const short = id => id.slice(0, 8) + '…'

  const llmChip = s => s.llm ? '<span class="llm-chip">LLM · $</span>'
    : s.free ? '<span class="free-chip">no LLM · free</span>' : ''

  function renderTabs() {
    $('#tabs').innerHTML = F.workflows
      .map(wf => `<button type="button" role="tab" data-id="${wf.id}" aria-selected="${wf === state.wf}">${esc(wf.name)}</button>`)
      .join('')
    document.querySelectorAll('#tabs button').forEach(b =>
      b.addEventListener('click', () => selectWorkflow(b.dataset.id)))
    $('#blurb').textContent = state.wf.blurb
    document.querySelectorAll('[data-wf]').forEach(el => { el.hidden = el.dataset.wf !== state.wf.id })
  }

  // A tab with `chart` is drawn as a flowchart (ovals, boxes, a diamond, side exits) instead of a card row.
  function renderChart() {
    const wf = state.wf
    const c = wf.chart
    const stepNo = id => wf.steps.findIndex(s => s.id === id)
    const lines = (label, cx, cy) => label
      .map((t, k) => `<text class="c-t${k ? ' c-sub' : ''}" x="${cx}" y="${cy + (k - (label.length - 1) / 2) * 17 + 5}" text-anchor="middle">${esc(t)}</text>`)
      .join('')
    const seen = new Set()
    const nodes = c.nodes.map(n => {
      const i = stepNo(n.step)
      const s = wf.steps[i]
      let shape, cx, cy, bx, by
      if (n.kind === 'decide') {
        cx = n.cx; cy = n.cy
        shape = `<polygon class="c-shape" points="${cx},${cy - n.r} ${cx + n.r},${cy} ${cx},${cy + n.r} ${cx - n.r},${cy}" />`
        bx = cx - n.r + 4; by = cy - n.r + 4
      } else {
        cx = n.x + n.w / 2; cy = n.y + n.h / 2
        const rx = n.kind === 'start' || n.kind === 'end' ? n.h / 2 : 8
        shape = `<rect class="c-shape" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" />`
        bx = n.x + (rx > 8 ? 14 : 2); by = n.y + 2
      }
      // The numbered badge goes on the first node of each step; side exits share their step's number.
      const badge = seen.has(n.step) || n.kind === 'bad' ? ''
        : `<circle class="c-badge" cx="${bx}" cy="${by}" r="10" /><text class="c-badge-t" x="${bx}" y="${by + 4}" text-anchor="middle">${i + 1}</text>`
      seen.add(n.step)
      return `<g class="c-node c-${n.kind}" data-i="${i}" tabindex="0" role="button" aria-label="Step ${i + 1}: ${esc(s.action)}">
        ${shape}${lines(n.label, cx, cy)}${badge}</g>`
    }).join('')
    const edges = c.edges.map(e => `
      <path class="c-edge${e.kind ? ' c-edge-' + e.kind : ''}" d="${e.d}" marker-end="url(#c-ah${e.kind === 'bad' ? '-bad' : ''})" />
      ${e.label ? `<text class="c-label${e.kind === 'bad' ? ' c-label-bad' : ''}" x="${e.lx}" y="${e.ly}" text-anchor="${e.anchor || 'middle'}">${esc(e.label)}</text>` : ''}`)
      .join('')
    const groups = (c.groups || []).map(g => `
      <path class="c-group" d="M${g.x},62 V52 H${g.x + g.w} V62" />
      <text class="c-group-t" x="${g.x + g.w / 2}" y="42" text-anchor="middle">${esc(g.label)}</text>`).join('')
    $('#chart').innerHTML = `
      <div class="scroll">
        <svg class="chart" viewBox="0 24 ${c.w} ${c.h - 24}" role="img" aria-label="${esc(wf.name)} flowchart">
          <defs>
            <marker id="c-ah" viewBox="0 0 8 8" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path class="c-head" d="M0,0 L8,4 L0,8 z" /></marker>
            <marker id="c-ah-bad" viewBox="0 0 8 8" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path class="c-head-bad" d="M0,0 L8,4 L0,8 z" /></marker>
          </defs>
          ${groups}${edges}${nodes}
        </svg>
      </div>`
    document.querySelectorAll('#chart .c-node').forEach(g => {
      const open = () => { stop(); go(Number(g.dataset.i)) }
      g.addEventListener('click', open)
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } })
    })
  }

  function renderFlow() {
    const wf = state.wf
    $('#flow').hidden = !!wf.chart
    $('#chart').hidden = !wf.chart
    if (wf.chart) { $('#flow').innerHTML = ''; renderChart(); return }
    $('#chart').innerHTML = ''
    $('#flow').style.setProperty('--n', wf.steps.length)
    $('#flow').innerHTML = wf.steps
      .map((s, i) => `
        <li class="step sys-${s.sys}" data-i="${i}">
          <button type="button" aria-label="Step ${i + 1}: ${esc(s.name)}, ${esc(s.action)}">
            <span class="num">${i + 1}</span>
            <span class="name">${esc(s.name)}</span>
            <span class="action">${esc(s.action)}</span>
            ${s.req && wf.reqId ? `<span class="req-chip">req ${short(wf.reqId)}</span>` : ''}
            ${llmChip(s)}
            ${s.stop ? '<span class="stop-chip">or stops</span>' : ''}
          </button>
        </li>`)
      .join('')
    document.querySelectorAll('.step button').forEach(b =>
      b.addEventListener('click', () => { stop(); go(Number(b.parentElement.dataset.i)) }))
  }

  function renderDetail() {
    const steps = state.wf.steps
    const s = steps[state.index]
    const ids = Object.entries(s.ids || {})
      .map(([k, v]) => `<span class="id"><b>${esc(k)}</b><code>${esc(v)}</code></span>`)
      .join('')
    $('#detail').className = `card detail sys-${s.sys}`
    $('#detail').innerHTML = `
      <p class="where">${esc(state.wf.name)} · Step ${state.index + 1} of ${steps.length} · <b>${esc(s.name)}</b></p>
      <h2>${esc(s.action)} ${llmChip(s)}</h2>
      <ul>${s.lines.map(l => `<li>${l}</li>`).join('')}</ul>
      ${s.stop ? `<p class="stop">${esc(s.stop)}</p>` : ''}
      ${ids ? `<div class="ids">${ids}</div>` : ''}
      ${s.src ? `<p class="src">Code: <code>${esc(s.src)}</code></p>` : ''}
      <details><summary>Show data</summary><pre>${esc(JSON.stringify(s.data, null, 2))}</pre></details>`
  }

  function go(i) {
    const last = state.wf.steps.length - 1
    state.index = Math.max(0, Math.min(last, i))
    document.querySelectorAll('.step').forEach((el, n) => {
      el.classList.toggle('current', n === state.index)
      el.classList.toggle('done', n < state.index)
    })
    document.querySelectorAll('#chart .c-node').forEach(el => {
      const n = Number(el.dataset.i)
      el.classList.toggle('current', n === state.index)
      el.classList.toggle('done', n < state.index)
    })
    renderDetail()
    if (state.index === last) stop()
    $('#prev').disabled = state.index === 0
    $('#next').disabled = state.index === last
    $('#play').textContent = state.timer ? '❚❚ Pause' : state.index === last ? '↺ Replay' : '▶ Play'
    history.replaceState(null, '', `#${state.wf.id}/${state.wf.steps[state.index].id}`)
  }

  function stop() {
    clearInterval(state.timer)
    state.timer = null
  }

  function togglePlay() {
    if (state.timer) { stop(); go(state.index); return }
    if (state.index === state.wf.steps.length - 1) state.index = -1
    state.timer = setInterval(() => go(state.index + 1), 2200)
    go(state.index + 1)
  }

  function selectWorkflow(id, stepId) {
    stop()
    state.wf = F.workflows.find(w => w.id === id) || F.workflows[0]
    renderTabs()
    renderFlow()
    const i = state.wf.steps.findIndex(s => s.id === stepId)
    go(i >= 0 ? i : 0)
  }

  // The Before / After sections under the Raise events chart. Strings in FLOW.eventSections are trusted
  // authoring HTML (same as step `lines`); JSON samples are escaped.
  function renderEventSections() {
    const el = $('#event-sections')
    if (!el || !F.eventSections) return
    const rows = (list, cls) => list.map(([k, v]) => `<tr><th scope="row">${cls === 'mono' ? `<code>${esc(k)}</code>` : esc(k)}</th><td>${v}</td></tr>`).join('')
    el.innerHTML = F.eventSections.map(sec => `
      <section class="card figure ev-sec sys-${sec.sys}" aria-labelledby="ev-${sec.id}">
        <h3 id="ev-${sec.id}">${esc(sec.title)} <span class="ev-tag">${esc(sec.tag)}</span></h3>
        <p class="cap">${sec.summary}</p>
        <table class="ev-table"><tbody>${rows(sec.facts)}</tbody></table>
        <h4>Values it can use</h4>
        <table class="ev-table"><tbody>${rows(sec.vars, 'mono')}</tbody></table>
        <h4>Where it lives</h4>
        <ul class="ev-code">${sec.code.map(([f, what]) => `<li><code>${esc(f)}</code> <span>${what}</span></li>`).join('')}</ul>
        <h4>rules.json entry</h4>
        <p class="ev-note">${esc(sec.ruleNote)}</p>
        <pre>${esc(JSON.stringify(sec.rule, null, 2))}</pre>
        <details><summary>POST body the listener gets</summary><pre>${esc(JSON.stringify(sec.body, null, 2))}</pre></details>
      </section>`).join('')
  }
  renderEventSections()

  // Live listener: server.js stores what arrives at /listener/before and /listener/after and streams it here.
  const lis = { events: [], open: new Set() }
  const timeOf = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  function setLisState(state, text) {
    $('#lis-state').dataset.state = state
    $('#lis-state').textContent = text
    $('#lis-help').hidden = state !== 'off'
    $('#lis-clear').disabled = state !== 'on' || !lis.events.length
  }

  function renderListenerUrls() {
    const base = location.protocol.startsWith('http') ? location.origin : 'http://127.0.0.1:8765'
    $('#lis-urls').innerHTML = ['before', 'after'].map(t => `
      <div class="lis-url"><span class="lis-type lis-${t}">${t}</span><code>POST ${esc(base)}/listener/${t}</code></div>`).join('')
  }

  // One row per correlation ID: its before and after events side by side.
  function renderListener() {
    const runs = new Map()
    for (const e of lis.events) {
      const key = e.correlationId || `no-id-${e.id}`
      if (!runs.has(key)) runs.set(key, { key, id: e.correlationId, before: [], after: [], last: e.receivedAt })
      const r = runs.get(key)
      r[e.type].push(e)
      r.last = e.receivedAt
    }
    const list = [...runs.values()].sort((a, b) => b.last.localeCompare(a.last))
    $('#lis-clear').disabled = $('#lis-state').dataset.state !== 'on' || !list.length
    if (!list.length) {
      $('#lis-runs').innerHTML = '<p class="lis-empty">Nothing received yet. Trigger a PR review and the before event lands here before the container starts.</p>'
      return
    }
    // Payloads may be an object or a one-item array, and may or may not carry a status.
    const payloadOf = e => (Array.isArray(e.body) ? e.body[0] : e.body) || {}
    const actorsOf = r => {
      for (const e of [...r.after, ...r.before].reverse()) {
        const a = payloadOf(e).actors
        if (Array.isArray(a) && a.length) return a.map(x => `<code>${esc(x)}</code>`).join(' ')
      }
      return '<span class="lis-n">—</span>'
    }
    const cell = (arr, type) => {
      if (!arr.length) return `<td class="lis-miss">${type === 'after' ? 'not received' : '—'}</td>`
      const e = arr[arr.length - 1]
      const st = ` · <b>${esc(e.status || 'received')}</b>`
      return `<td>${timeOf(e.receivedAt)}${st}${arr.length > 1 ? ` <span class="lis-n">×${arr.length}</span>` : ''}${e.parseError ? ' <span class="lis-bad">not JSON</span>' : ''}</td>`
    }
    $('#lis-runs').innerHTML = `
      <div class="scroll"><table class="ev-table lis-table">
        <thead><tr><th>Correlation ID</th><th>Actors</th><th>Before</th><th>After</th><th></th></tr></thead>
        <tbody>${list.map(r => `
          <tr>
            <td><code>${r.id ? esc(r.id) : '(none)'}</code></td>
            <td>${actorsOf(r)}</td>
            ${cell(r.before, 'before')}${cell(r.after, 'after')}
            <td><button type="button" class="lis-toggle" data-key="${esc(r.key)}" aria-expanded="${lis.open.has(r.key)}">${lis.open.has(r.key) ? 'Hide' : 'Body'}</button></td>
          </tr>
          ${lis.open.has(r.key) ? `<tr class="lis-body"><td colspan="5">${[...r.before, ...r.after].map(e => `
            <p class="lis-meta"><span class="lis-type lis-${e.type}">${e.type}</span> ${timeOf(e.receivedAt)} · headers: ${esc(e.headerNames.join(', ') || 'none')}</p>
            <pre>${esc(typeof e.body === 'string' ? e.body : JSON.stringify(e.body, null, 2))}</pre>`).join('')}</td></tr>` : ''}`).join('')}
        </tbody>
      </table></div>`
    document.querySelectorAll('.lis-toggle').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.key
      lis.open.has(k) ? lis.open.delete(k) : lis.open.add(k)
      renderListener()
    }))
  }

  function connectListener() {
    renderListenerUrls()
    renderListener()
    if (!location.protocol.startsWith('http') || !window.EventSource) { setLisState('off', 'Not running'); return }
    setLisState('wait', 'Connecting…')
    const src = new EventSource('listener/stream')
    src.onopen = () => setLisState('on', 'Listening')
    // The browser retries on its own while the state is CONNECTING; if it gives up (CLOSED, e.g. the
    // server was restarted), open a fresh stream so the panel recovers without a page reload.
    src.onerror = () => {
      setLisState('off', 'Not running')
      if (src.readyState === EventSource.CLOSED) setTimeout(connectListener, 3000)
    }
    src.onmessage = m => {
      const msg = JSON.parse(m.data)
      if (msg.kind === 'snapshot') lis.events = msg.events
      else if (msg.kind === 'event') lis.events.push(msg.event)
      else if (msg.kind === 'cleared') { lis.events = []; lis.open.clear() }
      renderListener()
    }
  }
  $('#lis-clear').addEventListener('click', () => fetch('listener/events', { method: 'DELETE' }).catch(() => {}))
  connectListener()

  $('#prev').addEventListener('click', () => { stop(); go(state.index - 1) })
  $('#next').addEventListener('click', () => { stop(); go(state.index + 1) })
  $('#play').addEventListener('click', togglePlay)
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { stop(); go(state.index + 1) }
    else if (e.key === 'ArrowLeft') { stop(); go(state.index - 1) }
  })

  const [wfId, stepId] = decodeURIComponent(location.hash.slice(1)).split('/')
  selectWorkflow(wfId, stepId)
})()
