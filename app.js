/* Draws the workflow tabs, the step flow and the detail card from window.FLOW. No dependencies. */
(function () {
  const F = window.FLOW
  const $ = sel => document.querySelector(sel)
  const state = { wf: F.workflows[0], index: 0, timer: null }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const short = id => id.slice(0, 8) + '…'

  const llmChip = s => s.llm === 'optional'
    ? '<span class="llm-chip optional">LLM · optional</span>'
    : s.llm ? '<span class="llm-chip">LLM</span>' : ''

  function renderTabs() {
    $('#tabs').innerHTML = F.workflows
      .map(wf => `<button type="button" role="tab" data-id="${wf.id}" aria-selected="${wf === state.wf}">${esc(wf.name)}</button>`)
      .join('')
    document.querySelectorAll('#tabs button').forEach(b =>
      b.addEventListener('click', () => selectWorkflow(b.dataset.id)))
    $('#blurb').textContent = state.wf.blurb
  }

  function renderFlow() {
    const wf = state.wf
    $('#flow').style.setProperty('--n', wf.steps.length)
    $('#flow').innerHTML = wf.steps
      .map((s, i) => `
        <li class="step sys-${s.sys}" data-i="${i}">
          <button type="button" aria-label="Step ${i + 1}: ${esc(s.name)}, ${esc(s.action)}">
            <span class="num">${i + 1}</span>
            <span class="name">${esc(s.name)}</span>
            <span class="action">${esc(s.action)}</span>
            ${s.req ? `<span class="req-chip">req ${short(wf.reqId)}</span>` : ''}
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
