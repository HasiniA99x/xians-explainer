/* Draws the nine-step flow and the detail card from window.FLOW. No dependencies. */
(function () {
  const F = window.FLOW
  const all = [...F.steps, F.redeliver]
  const $ = sel => document.querySelector(sel)
  const state = { index: 0, timer: null }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const short = id => id.slice(0, 8) + '…'

  function renderFlow() {
    $('#flow').innerHTML = F.steps
      .map((s, i) => `
        <li class="step sys-${s.sys}" data-i="${i}">
          <button type="button" aria-label="Step ${i + 1}: ${esc(s.name)}, ${esc(s.action)}">
            <span class="num">${i + 1}</span>
            <span class="name">${esc(s.name)}</span>
            <span class="action">${esc(s.action)}</span>
            ${s.req ? `<span class="req-chip">req ${short(F.ID.requestId)}</span>` : ''}
            ${s.stop ? '<span class="stop-chip">or stops</span>' : ''}
          </button>
        </li>`)
      .join('')
    document.querySelectorAll('.step button').forEach(b =>
      b.addEventListener('click', () => { stop(); go(Number(b.parentElement.dataset.i)) }))
  }

  function renderDetail() {
    const s = all[state.index]
    const isLoop = s === F.redeliver
    const ids = Object.entries(s.ids || {})
      .map(([k, v]) => `<span class="id"><b>${esc(k)}</b><code>${esc(v)}</code></span>`)
      .join('')
    $('#detail').className = `card detail sys-${s.sys}`
    $('#detail').innerHTML = `
      <p class="where">${isLoop ? '↺ Redeliver' : `Step ${state.index + 1} of ${F.steps.length}`} · <b>${esc(s.name)}</b></p>
      <h2>${esc(s.action)}</h2>
      <ul>${s.lines.map(l => `<li>${l}</li>`).join('')}</ul>
      ${s.stop ? `<p class="stop">${esc(s.stop)}</p>` : ''}
      ${ids ? `<div class="ids">${ids}</div>` : ''}
      <details><summary>Show data</summary><pre>${esc(JSON.stringify(s.data, null, 2))}</pre></details>`
  }

  function go(i) {
    state.index = Math.max(0, Math.min(all.length - 1, i))
    document.querySelectorAll('.step').forEach((el, n) => {
      el.classList.toggle('current', n === state.index)
      el.classList.toggle('done', n < state.index)
    })
    $('#loop').classList.toggle('current', state.index === all.length - 1)
    renderDetail()
    if (state.index === all.length - 1) stop()
    $('#prev').disabled = state.index === 0
    $('#next').disabled = state.index === all.length - 1
    $('#play').textContent = state.timer ? '❚❚ Pause' : state.index === all.length - 1 ? '↺ Replay' : '▶ Play'
    history.replaceState(null, '', '#' + all[state.index].id)
  }

  function stop() {
    clearInterval(state.timer)
    state.timer = null
  }

  function togglePlay() {
    if (state.timer) { stop(); go(state.index); return }
    if (state.index === all.length - 1) state.index = -1
    state.timer = setInterval(() => go(state.index + 1), 2200)
    go(state.index + 1)
  }

  $('#prev').addEventListener('click', () => { stop(); go(state.index - 1) })
  $('#next').addEventListener('click', () => { stop(); go(state.index + 1) })
  $('#play').addEventListener('click', togglePlay)
  $('#loop').addEventListener('click', () => { stop(); go(all.length - 1) })
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { stop(); go(state.index + 1) }
    else if (e.key === 'ArrowLeft') { stop(); go(state.index - 1) }
  })

  renderFlow()
  const start = all.findIndex(s => s.id === location.hash.slice(1))
  go(start >= 0 ? start : 0)
})()
