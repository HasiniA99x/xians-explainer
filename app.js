/* Renders the swimlane diagram and the debug panel from window.FLOW. No dependencies. */
(function () {
  const F = window.FLOW
  const SVG_NS = 'http://www.w3.org/2000/svg'

  // The lane names sit in their own fixed column, so they stay visible while the diagram scrolls.
  const LABEL_W = () => (window.innerWidth < 640 ? 112 : 176)
  const LEFT_PAD = 40
  const COL_W = 100
  const LANE_H = 72
  const PAD_TOP = 10
  const R = 16
  const PLAY_MS = 2600

  const ID_LABELS = {
    githubDelivery: 'X-GitHub-Delivery',
    requestId: 'Request ID',
    incomingId: 'Delivery ID',
    integratorWorkflowId: 'Integrator workflow',
    processingWorkflowId: 'Processing workflow',
    containerId: 'Container',
  }

  const state = { scenario: F.scenarios[0], index: 0, timer: null }

  const $ = sel => document.querySelector(sel)
  const el = (tag, attrs = {}, parent) => {
    const node = document.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    if (parent) parent.appendChild(node)
    return node
  }
  const escapeHtml = s =>
    String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  /** The step as this scenario shows it: base step with the scenario's replacements applied. */
  function stepFor(scenario, id) {
    return { id, ...F.steps[id], ...(scenario.overrides[id] || {}) }
  }

  /**
   * In the redelivery scenario the IDs that change are the redelivery's own. Its first step still
   * works with the original delivery.
   */
  function idValue(scenario, key, stepId) {
    if (scenario.id === 'redelivery') {
      if (key === 'requestId') return F.ID.redeliveryRequestId
      if (key === 'processingWorkflowId') return F.ID.redeliveryProcessingWorkflowId
      if (key === 'incomingId' && stepId !== 'redeliver') return F.ID.redeliveryIncomingId
    }
    return F.ID[key]
  }

  const tagIcon = (cls = 'ico tag-ico') => `<svg class="${cls}" aria-hidden="true"><use href="#i-tag" /></svg>`

  function highlightJson(value) {
    const json = escapeHtml(JSON.stringify(value, null, 2))
    return json.replace(
      /(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g,
      (match, str, colon, lit, num) => {
        if (str) return colon ? `<span class="tok-key">${str}</span>${colon}` : `<span class="tok-str">${str}</span>`
        if (lit) return `<span class="tok-lit">${lit}</span>`
        if (num) return `<span class="tok-num">${num}</span>`
        return match
      }
    )
  }

  // ── Scenario tabs ─────────────────────────────────────────────────────────

  function renderTabs() {
    const nav = $('#scenarios')
    nav.innerHTML = ''
    for (const scenario of F.scenarios) {
      const button = document.createElement('button')
      button.type = 'button'
      button.role = 'tab'
      button.textContent = scenario.name
      button.setAttribute('aria-selected', String(scenario === state.scenario))
      button.addEventListener('click', () => selectScenario(scenario.id))
      nav.appendChild(button)
    }
    $('#scenario-blurb').textContent = state.scenario.blurb
  }

  // ── Diagram ───────────────────────────────────────────────────────────────

  function nodePos(scenario, id) {
    const col = scenario.order.indexOf(id)
    const lane = F.lanes.findIndex(l => l.id === F.steps[id].lane)
    return { x: LEFT_PAD + col * COL_W, y: PAD_TOP + lane * LANE_H + LANE_H / 2 }
  }

  function edgePath(a, b, kind) {
    if (kind === 'return') {
      // Arcs above the lanes it crosses, back to an earlier column, clear of the step labels below.
      const rise = Math.max(PAD_TOP + 4, Math.min(a.y, b.y) - LANE_H * 0.75)
      return `M ${a.x} ${a.y - R} C ${a.x} ${rise}, ${b.x + R * 2} ${rise}, ${b.x + 4} ${b.y - R - 3}`
    }
    if (a.y === b.y) return `M ${a.x + R} ${a.y} L ${b.x - R - 3} ${b.y}`
    const dx = Math.max(30, (b.x - a.x) * 0.5)
    const startX = a.x + (b.x > a.x ? R * 0.7 : 0)
    const startY = a.y + (b.y > a.y ? R * 0.7 : -R * 0.7)
    const endX = b.x - (b.x > a.x ? R + 3 : 0)
    return `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${b.y}, ${endX} ${b.y}`
  }

  function renderDiagram() {
    const scenario = state.scenario
    const svg = $('#diagram')
    svg.innerHTML = ''
    const width = LEFT_PAD + (scenario.order.length - 1) * COL_W + 60
    const height = PAD_TOP * 2 + F.lanes.length * LANE_H
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg.setAttribute('width', width)
    svg.setAttribute('height', height)

    const labelWidth = LABEL_W()
    const labels = $('#lane-labels')
    labels.innerHTML = ''
    labels.setAttribute('viewBox', `0 0 ${labelWidth} ${height}`)
    labels.setAttribute('width', labelWidth)
    labels.setAttribute('height', height)
    F.lanes.forEach((lane, i) => {
      const y = PAD_TOP + i * LANE_H
      el('rect', { x: 0, y, width: labelWidth, height: LANE_H, class: `lane-band${i % 2 ? ' alt' : ''}` }, labels)
      el('rect', { x: 8, y: y + 14, width: 4, height: LANE_H - 28, class: 'lane-bar', style: `fill: var(--lane-${lane.id})` }, labels)
      const name = el('text', { x: 18, y: y + LANE_H / 2 - 3, class: 'lane-name' }, labels)
      name.textContent = labelWidth < 150 ? lane.short : lane.name
      const sub = el('text', { x: 18, y: y + LANE_H / 2 + 13, class: 'lane-sub' }, labels)
      sub.textContent = lane.sub
    })

    const defs = el('defs', {}, svg)
    for (const kind of ['call', 'async', 'read', 'return']) {
      const marker = el('marker', { id: `arrow-${kind}`, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs)
      el('path', { d: 'M 0 0 L 10 5 L 0 10 z', style: `fill: var(--edge-${kind})` }, marker)
    }

    F.lanes.forEach((_, i) => {
      el('rect', { x: 0, y: PAD_TOP + i * LANE_H, width, height: LANE_H, class: `lane-band${i % 2 ? ' alt' : ''}` }, svg)
    })

    const edgeLayer = el('g', {}, svg)
    for (const [from, to, kind = 'call'] of scenario.edges) {
      const path = el('path', {
        d: edgePath(nodePos(scenario, from), nodePos(scenario, to), kind),
        class: `edge ${kind}`,
        'marker-end': `url(#arrow-${kind})`,
        'data-from': from,
        'data-to': to,
      }, edgeLayer)
      path.dataset.kind = kind
    }

    scenario.order.forEach((id, i) => {
      const step = stepFor(scenario, id)
      const { x, y } = nodePos(scenario, id)
      const color = `var(--lane-${step.lane})`
      const g = el('g', { class: 'node', tabindex: 0, role: 'button', 'data-id': id, 'aria-label': `Step ${i + 1}: ${step.title}` }, svg)
      el('circle', { cx: x, cy: y, r: R + 5, class: 'halo', style: `stroke: ${color}` }, g)
      el('circle', { cx: x, cy: y, r: R, class: 'body', style: `stroke: ${color}` }, g)
      el('circle', { cx: x - R + 2, cy: y - R + 2, r: 4, class: 'bp-dot' }, g)
      const num = el('text', { x, y, class: 'num' }, g)
      num.textContent = i + 1
      const label = el('text', { x, y: y + R + 15, class: 'label' }, g)
      label.textContent = step.short
      if (step.pr) {
        const mark = el('text', { x: x + R - 2, y: y - R + 1, class: 'pr-mark' }, g)
        mark.textContent = 'PR'
      }
      if (step.tagged) {
        el('use', { href: '#i-tag', x: x + R - 5, y: y + R - 9, width: 13, height: 13, class: 'node-tag' }, g)
      }
      g.addEventListener('click', () => go(i))
      g.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(i) }
      })
    })
  }

  function updateDiagram(instant = false) {
    const scenario = state.scenario
    const currentId = scenario.order[state.index]
    document.querySelectorAll('#diagram .node').forEach(node => {
      const i = scenario.order.indexOf(node.dataset.id)
      node.classList.toggle('current', i === state.index)
      node.classList.toggle('done', i < state.index)
    })
    const reached = new Set(scenario.order.slice(0, state.index + 1))
    document.querySelectorAll('#diagram .edge').forEach(edge => {
      const into = edge.dataset.to === currentId && reached.has(edge.dataset.from)
      edge.classList.toggle('live', into)
      edge.classList.toggle('dim', !(reached.has(edge.dataset.from) && reached.has(edge.dataset.to)))
    })

    const current = document.querySelector(`#diagram .node[data-id="${currentId}"]`)
    const scroller = $('#diagram-scroll')
    if (current && scroller) {
      const { x } = nodePos(scenario, currentId)
      const left = x - scroller.clientWidth / 2
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      scroller.scrollTo({ left: Math.max(0, left), behavior: instant || reduce ? 'auto' : 'smooth' })
    }
  }

  // ── Debug panel ───────────────────────────────────────────────────────────

  function renderPanel() {
    const scenario = state.scenario
    const id = scenario.order[state.index]
    const step = stepFor(scenario, id)
    const lane = F.lanes.find(l => l.id === step.lane)

    const ids = (step.ids || [])
      .map(key => `<div class="id-chip"><b>${escapeHtml(ID_LABELS[key] || key)}</b><code>${escapeHtml(idValue(scenario, key, id))}</code></div>`)
      .join('')
    const where = (step.where || [])
      .map(([repo, path]) => `<li><span class="repo">${escapeHtml(repo)}</span><span class="path mono">${escapeHtml(path)}</span></li>`)
      .join('')

    $('#panel').innerHTML = `
      <div class="meta">
        <span>Step ${state.index + 1} of ${scenario.order.length}</span>
        <span class="lane-chip"><i style="background: var(--lane-${lane.id})"></i>${escapeHtml(lane.name)}</span>
      </div>
      <h3>${step.title}</h3>
      ${step.tagged ? `<div class="tag-note">${tagIcon()}<span>Logs here carry <code>requestId</code><small>${escapeHtml(step.tagged)}</small></span></div>` : ''}
      <h4><i class="bp"></i>Debug point — data at this step</h4>
      <div class="debug-box">
        <button type="button" class="btn copy" id="copy-json">Copy</button>
        <pre id="debug-json">${highlightJson(step.data)}</pre>
      </div>
      ${ids ? `<h4>IDs known here</h4><div class="id-chips">${ids}</div>` : ''}
      <h4>What happens</h4>
      <ul>${step.what.map(line => `<li>${line}</li>`).join('')}</ul>
      <details class="where-box">
        <summary>Where in the code <span class="count">${(step.where || []).length}</span></summary>
        <ul class="where">${where}</ul>
      </details>
      ${step.pr ? `<div class="pr-note"><span class="pr-chip">PR</span> ${step.pr}</div>` : ''}
    `

    $('#copy-json').addEventListener('click', async e => {
      const button = e.currentTarget
      try {
        await navigator.clipboard.writeText(JSON.stringify(step.data, null, 2))
        button.textContent = 'Copied'
      } catch {
        button.textContent = 'Copy failed'
      }
      setTimeout(() => (button.textContent = 'Copy'), 1400)
    })
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  function updateControls() {
    const last = state.scenario.order.length - 1
    const scrub = $('#scrub')
    scrub.max = String(last)
    scrub.value = String(state.index)
    $('#counter').textContent = `${state.index + 1} / ${last + 1}`
    $('#prev').disabled = state.index === 0
    $('#next').disabled = state.index === last
    $('#play').textContent = state.timer ? '❚❚ Pause' : state.index === last ? '↺ Replay' : '▶ Play'
  }

  function writeHash() {
    const id = state.scenario.order[state.index]
    history.replaceState(null, '', `#${state.scenario.id}/${id}`)
  }

  function go(index, instant = false) {
    const last = state.scenario.order.length - 1
    state.index = Math.max(0, Math.min(last, index))
    updateDiagram(instant)
    updateIdGrid()
    renderPanel()
    if (state.index === last) stop()
    updateControls()
    writeHash()
  }

  function stop() {
    if (state.timer) clearInterval(state.timer)
    state.timer = null
  }

  function togglePlay() {
    if (state.timer) {
      stop()
      updateControls()
      return
    }
    if (state.index === state.scenario.order.length - 1) go(0)
    state.timer = setInterval(() => go(state.index + 1), PLAY_MS)
    updateControls()
  }

  function selectScenario(scenarioId, stepId) {
    stop()
    state.scenario = F.scenarios.find(s => s.id === scenarioId) || F.scenarios[0]
    const index = stepId ? state.scenario.order.indexOf(stepId) : 0
    state.index = index >= 0 ? index : 0
    renderTabs()
    renderDiagram()
    renderIdGrid()
    go(state.index, true)
  }

  // ── ID grid: which identifiers exist at each step of the current scenario ─

  const GRID = { label: 176, col: 46, head: 36, row: 26 }
  const ID_COLORS = {
    githubDelivery: 'var(--lane-github)',
    requestId: 'var(--accent)',
    incomingId: 'var(--lane-mongo)',
    integratorWorkflowId: 'var(--lane-integrator)',
    processingWorkflowId: 'var(--lane-processing)',
    containerId: 'var(--lane-executor)',
  }

  function renderIdGrid() {
    const scenario = state.scenario
    const svg = $('#idgrid')
    svg.innerHTML = ''
    const rows = [...F.idTrace, { key: 'tagged', name: 'Logs tagged', born: 'Xians.Lib', travels: 'Every log written while handling the request carries properties.requestId.' }]
    const cols = scenario.order.map(id => stepFor(scenario, id))
    const width = GRID.label + cols.length * GRID.col + 8
    const height = GRID.head + rows.length * GRID.row + 8
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg.setAttribute('width', width)
    svg.setAttribute('height', height)

    rows.forEach((_, r) => {
      el('rect', { x: 0, y: GRID.head + r * GRID.row, width, height: GRID.row, class: `lane-band${r % 2 ? ' alt' : ''}` }, svg)
    })
    el('rect', { id: 'idgrid-current', x: 0, y: 2, width: GRID.col, height: height - 4, rx: 8, class: 'idgrid-current' }, svg)

    cols.forEach((step, c) => {
      const cx = GRID.label + c * GRID.col + GRID.col / 2
      el('circle', { cx, cy: 18, r: 11, class: 'idgrid-step', style: `stroke: var(--lane-${step.lane})` }, svg)
      el('text', { x: cx, y: 18, class: 'idgrid-num' }, svg).textContent = c + 1
    })

    rows.forEach((row, r) => {
      const y = GRID.head + r * GRID.row
      const label = el('text', { x: 12, y: y + 17, class: 'idgrid-name' }, svg)
      label.textContent = row.name
      const tip = el('title', {}, label)
      tip.textContent = row.key === 'tagged' ? row.travels : `${idValue(scenario, row.key)}\nBorn: ${row.born}\n${row.travels}`

      if (row.key === 'tagged') {
        cols.forEach((step, c) => {
          if (!step.tagged) return
          el('use', { href: '#i-tag', x: GRID.label + c * GRID.col + GRID.col / 2 - 8, y: y + 5, width: 16, height: 16, class: 'node-tag' }, svg)
        })
        return
      }

      // Contiguous stretches where the ID is known, drawn as one bar; the dot marks where it appears.
      const known = cols.map(step => (step.ids || []).includes(row.key))
      for (let c = 0; c < known.length; c++) {
        if (!known[c]) continue
        let end = c
        while (end + 1 < known.length && known[end + 1]) end++
        const x = GRID.label + c * GRID.col + 8
        const w = (end - c + 1) * GRID.col - 16
        el('rect', { x, y: y + 8, width: w, height: 10, rx: 5, class: 'idgrid-bar', style: `fill: ${ID_COLORS[row.key]}` }, svg)
        el('circle', { cx: x + 5, cy: y + 13, r: 5, class: 'idgrid-dot', style: `fill: ${ID_COLORS[row.key]}` }, svg)
        c = end
      }
    })

    cols.forEach((step, c) => {
      const hit = el('rect', { x: GRID.label + c * GRID.col, y: 0, width: GRID.col, height, class: 'idgrid-hit' }, svg)
      el('title', {}, hit).textContent = `Step ${c + 1}: ${step.title}`
      hit.addEventListener('click', () => { stop(); go(c) })
    })
  }

  function updateIdGrid() {
    const x = GRID.label + state.index * GRID.col
    const current = $('#idgrid-current')
    if (current) current.setAttribute('x', x)
    const scroller = $('#idgrid-scroll')
    if (scroller && (x < scroller.scrollLeft + GRID.label || x + GRID.col > scroller.scrollLeft + scroller.clientWidth)) {
      scroller.scrollTo({ left: Math.max(0, x - scroller.clientWidth / 2) })
    }
  }

  // ── Figures ───────────────────────────────────────────────────────────────

  function text(parent, x, y, cls, value, attrs = {}) {
    const node = el('text', { x, y, class: cls, ...attrs }, parent)
    node.textContent = value
    return node
  }

  /** The log rows in "One request ID finds every log". */
  function renderLogFigure() {
    const g = $('#fig-logs')
    const rows = [
      ['integrator', 'Dequeued message for processing'],
      ['handler', 'Signature verified (github)'],
      ['handler', 'Matched github-pull-request-review'],
      ['processing', 'Workspace volume ready'],
      ['processing', `Container ${F.ID.containerId} started`],
      ['processing', 'Raise-event ai-hub-metrics sent'],
    ]
    rows.forEach(([lane, message], i) => {
      const y = 50 + i * 50
      el('rect', { x: 660, y, width: 230, height: 42, rx: 8, class: 'fig-log' }, g)
      el('circle', { cx: 676, cy: y + 14, r: 5, style: `fill: var(--lane-${lane})` }, g)
      text(g, 688, y + 18, 'fig-log-text', message)
      el('use', { href: '#i-tag', x: 686, y: y + 24, width: 12, height: 12, class: 'fig-accent-fill' }, g)
      text(g, 702, y + 34, 'fig-mono fig-small fig-accent', `requestId ${F.ID.requestId.slice(0, 8)}…`)
    })
  }

  /** The round trip in "Redeliver a recorded call". */
  function renderRedeliverFigure() {
    const g = $('#fig-redeliver')
    const W = 150, H = 118, Y = 30, GAP = 30
    const boxX = i => 40 + i * (W + GAP)
    const box = (i, lane, title) => {
      const x = boxX(i)
      el('rect', { x, y: Y, width: W, height: H, rx: 10, class: 'fig-box' }, g)
      el('rect', { x, y: Y, width: W, height: 5, rx: 2, style: `fill: var(--lane-${lane})` }, g)
      text(g, x + 14, Y + 28, 'fig-title', title)
      return x
    }

    let x = box(0, 'studio', 'Agent Studio')
    el('rect', { x: x + 14, y: Y + 42, width: 122, height: 30, rx: 6, style: 'fill: var(--lane-studio)' }, g)
    text(g, x + 75, Y + 62, 'fig-btn-solid', 'Redeliver now', { 'text-anchor': 'middle' })
    text(g, x + 14, Y + 96, 'fig-sub', 'developer · admin')

    x = box(1, 'server', 'Admin API')
    el('use', { href: '#i-check', x: x + 12, y: Y + 44, width: 18, height: 18, class: 'fig-ok' }, g)
    text(g, x + 34, Y + 58, 'fig-sub', 'capability')
    text(g, x + 14, Y + 80, 'fig-mono fig-small fig-accent', 'webhooks:redeliver')
    text(g, x + 14, Y + 104, 'fig-sub', 'acts for the user')

    x = box(2, 'server', 'Signed claim')
    el('rect', { x: x + 14, y: Y + 40, width: 122, height: 44, rx: 6, class: 'fig-ticket' }, g)
    text(g, x + 75, Y + 58, 'fig-mono fig-small', 'HMAC · 5 min', { 'text-anchor': 'middle' })
    text(g, x + 75, Y + 75, 'fig-mono fig-small fig-accent', 'one use', { 'text-anchor': 'middle' })
    text(g, x + 14, Y + 104, 'fig-sub', 'token never stored')

    x = box(3, 'server', 'POST to itself')
    text(g, x + 14, Y + 58, 'fig-mono fig-small', 'own URL')
    text(g, x + 14, Y + 74, 'fig-mono fig-small', 'own address')
    text(g, x + 14, Y + 104, 'fig-sub', 'no outside host')

    x = box(4, 'integrator', 'Normal path')
    const dots = [['server', 'auth'], ['mongo', 'record'], ['integrator', 'signal'], ['handler', 'agent']]
    dots.forEach(([lane, name], i) => {
      const cx = x + 24 + i * 34
      if (i) el('line', { x1: cx - 28, y1: Y + 58, x2: cx - 6, y2: Y + 58, class: 'fig-rule' }, g)
      el('circle', { cx, cy: Y + 58, r: 6, class: 'fig-dot', style: `stroke: var(--lane-${lane})` }, g)
      text(g, cx, Y + 80, 'fig-tiny', name, { 'text-anchor': 'middle' })
    })
    text(g, x + 14, Y + 104, 'fig-sub', 'everything runs again')

    x = box(5, 'processing', 'New run')
    el('rect', { x: x + 14, y: Y + 42, width: 122, height: 28, rx: 14, class: 'fig-pill' }, g)
    text(g, x + 75, Y + 61, 'fig-mono fig-small fig-accent', `${F.ID.redeliveryRequestId.slice(0, 8)}…`, { 'text-anchor': 'middle' })
    text(g, x + 14, Y + 90, 'fig-sub', 'new request ID')
    text(g, x + 14, Y + 106, 'fig-sub', 'own row, logs, review')

    for (let i = 0; i < 5; i++) {
      const kind = i === 4 ? 'async' : ''
      el('path', {
        d: `M ${boxX(i) + W + 2} ${Y + H / 2} H ${boxX(i + 1) - 3}`,
        class: `fig-edge ${kind}`,
        'marker-end': `url(#fig-arrow${kind ? '-async' : ''})`,
      }, g)
    }

    const from = boxX(4) + W / 2
    const to = boxX(0) + W / 2
    el('path', { d: `M ${from} ${Y + H + 2} C ${from} ${Y + H + 78}, ${to} ${Y + H + 78}, ${to} ${Y + H + 5}`, class: 'fig-edge return', 'marker-end': 'url(#fig-arrow-return)' }, g)
    text(g, (from + to) / 2, Y + H + 76, 'fig-label fig-return', 'answer → toast in Studio', { 'text-anchor': 'middle' })
  }

  // ── Wire up ───────────────────────────────────────────────────────────────

  $('#prev').addEventListener('click', () => { stop(); go(state.index - 1) })
  $('#next').addEventListener('click', () => { stop(); go(state.index + 1) })
  $('#play').addEventListener('click', togglePlay)
  $('#scrub').addEventListener('input', e => { stop(); go(Number(e.target.value)) })
  document.addEventListener('keydown', e => {
    // Space on a button or slider keeps its own meaning; arrows always step.
    const onControl = e.target instanceof Element && e.target.closest('input, textarea, button, [role="button"]')
    if (onControl && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    if (e.key === 'ArrowRight') { stop(); go(state.index + 1) }
    else if (e.key === 'ArrowLeft') { stop(); go(state.index - 1) }
    else if (e.key === ' ') { e.preventDefault(); togglePlay() }
  })

  $('#play-redelivery').addEventListener('click', () => {
    selectScenario('redelivery')
    $('.diagram-card').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    togglePlay()
  })

  renderLogFigure()
  renderRedeliverFigure()
  const [hashScenario, hashStep] = decodeURIComponent(location.hash.slice(1)).split('/')
  selectScenario(hashScenario || F.scenarios[0].id, hashStep)
})()
