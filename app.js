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
