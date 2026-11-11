/*
 * The Xians webhook flow in nine steps, plus redelivery. Traced from XiansAi.Server, XiansAi.Lib,
 * the-agent and agent-studio (main plus open PRs: Lib #146, Server #661/#666, Studio #174/#175,
 * agent #106). Values are made up; their shapes match the code.
 */
(function () {
  const ID = {
    githubDelivery: '8c3f2e10-7b1d-11f1-9a4c-2f6d0e1b5a77',
    requestId: '3f9a6c2e-41d8-4b7e-9c55-0a1e7d2b8f64',
    deliveryId: '019a6b2e-5c41-7a10-9d3e-6f2b1c8e4a90',
    integrator: 'acme:Xianix AI-DLC Agent:Integrator Workflow:hooks',
    newRequestId: 'b71e0d4c-9a2f-4c61-8e3b-5d7a1f0c2e98',
  }
  ID.processing = `acme:Xianix AI-DLC Agent:Processing Workflow:hooks:${ID.requestId}`

  /** `sys` picks the colour. `req` = the request ID has reached this step. */
  const steps = [
    {
      id: 'github', sys: 'github', name: 'GitHub', action: 'PR labelled',
      lines: [
        'Someone adds the <code>ai-dlc/pr/pr-review</code> label.',
        'GitHub sends the event to the Xians webhook URL.',
      ],
      ids: { 'GitHub delivery': ID.githubDelivery },
      data: { event: 'pull_request', action: 'labeled', label: 'ai-dlc/pr/pr-review', pr: 42, repo: 'acme/payments-api' },
    },
    {
      id: 'server', sys: 'server', name: 'Xians Server', action: 'Gives a request ID', req: true,
      lines: [
        'Checks the API key in the URL.',
        'Creates a new <b>request ID</b>. It follows this delivery everywhere.',
      ],
      ids: { 'Request ID': ID.requestId },
      data: { path: '/api/user/webhooks/builtin', auth: 'apikeyId → ok', requestId: ID.requestId },
    },
    {
      id: 'mongo', sys: 'mongo', name: 'MongoDB', action: 'Saves the call', req: true,
      lines: [
        'Stores the headers and body as one delivery.',
        'This is what you see — and can redeliver — in Agent Studio.',
      ],
      ids: { 'Delivery ID': ID.deliveryId, 'Request ID': ID.requestId },
      data: { collection: 'webhook_incomings', _id: ID.deliveryId, request_id: ID.requestId, keeps: 'newest 100 per webhook' },
    },
    {
      id: 'integrator', sys: 'integrator', name: 'Integrator Workflow', action: 'Queues it', req: true,
      lines: [
        'One long-lived workflow receives every delivery.',
        'It hands this one to the agent.',
      ],
      ids: { 'Workflow': ID.integrator },
      data: { temporal: 'signal-with-start', workflowId: ID.integrator, signal: 'HandleInboundChatOrData' },
    },
    {
      id: 'agent', sys: 'handler', name: 'Agent', action: 'Checks & matches', req: true,
      lines: [
        'Verifies the GitHub signature, then matches <code>rules.json</code>.',
        'Answers GitHub <b>200</b> straight away.',
      ],
      stop: 'No match or bad signature → answers “ignored” and stops here.',
      ids: { 'Request ID': ID.requestId },
      data: { signature: 'passed', matched: 'github-pull-request-review', replyToGitHub: { status: 200, body: { status: 'success', matchCount: 1 } } },
    },
    {
      id: 'processing', sys: 'processing', name: 'Processing Workflow', action: 'Starts the run', req: true,
      lines: [
        'One run per matched rule.',
        'Its ID ends with the request ID, so Studio can find it.',
      ],
      ids: { 'Run': ID.processing },
      data: { workflowId: ID.processing, memo: { requestId: ID.requestId } },
    },
    {
      id: 'executor', sys: 'executor', name: 'Executor', action: 'Claude reviews', req: true,
      lines: [
        'A Docker container runs Claude Code.',
        'The <code>pr-reviewer</code> plugin reviews PR #42.',
      ],
      ids: { 'Request ID': ID.requestId },
      data: { image: '99xio/xianix-executor:latest', plugin: 'pr-reviewer', prompt: '/pr-review 42', model: 'claude-sonnet-4-5' },
    },
    {
      id: 'review', sys: 'github', name: 'GitHub', action: 'Review posted',
      lines: ['A summary and inline comments appear on the PR.'],
      data: { pr: 'acme/payments-api#42', summary: 1, inlineComments: 4, took: '≈ 3.5 min' },
    },
    {
      id: 'studio', sys: 'studio', name: 'Agent Studio', action: 'See logs · Redeliver', req: true,
      lines: [
        '<b>Logs</b> opens every log tagged with this request ID.',
        'No tagged logs → the button reads <b>No logs</b>.',
        '<b>Redeliver</b> sends the saved call again (below).',
      ],
      ids: { 'Delivery ID': ID.deliveryId, 'Request ID': ID.requestId },
      data: { logsLink: `/settings/logs?requestId=${ID.requestId}` },
    },
  ]

  const redeliver = {
    id: 'redeliver', sys: 'studio', name: 'Redeliver', action: 'Send the saved call again',
    lines: [
      'Studio asks the server to resend the saved call to <b>step 2</b>.',
      'It gets a <b>new request ID</b>, a new delivery row and a new review run.',
      'Already running → <b>409</b>. No answer in time → “Could not confirm”.',
    ],
    ids: { 'Original delivery': ID.deliveryId, 'New request ID': ID.newRequestId },
    data: { redeliveryOf: ID.deliveryId, newRequestId: ID.newRequestId, claim: 'signed · 5 min · one use', result: 'Redelivered · answered 200 in 1.4 s' },
  }

  window.FLOW = { ID, steps, redeliver }
})()
