/*
 * The Xians webhook flows: a GitHub trigger and a redelivery, nine steps each. Traced from XiansAi.Server, XiansAi.Lib,
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
    newDeliveryId: '019a6b4f-0e12-7c33-8a51-2b9d4e7f1c06',
  }
  ID.processing = `acme:Xianix AI-DLC Agent:Processing Workflow:hooks:${ID.requestId}`
  ID.newProcessing = `acme:Xianix AI-DLC Agent:Processing Workflow:hooks:${ID.newRequestId}`

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
        '<b>Redeliver</b> sends the saved call again (see the Redeliver tab).',
      ],
      ids: { 'Delivery ID': ID.deliveryId, 'Request ID': ID.requestId },
      data: { logsLink: `/settings/logs?requestId=${ID.requestId}` },
    },
  ]

  /** Redeliver: a developer re-sends a saved call from Agent Studio. */
  const redeliverSteps = [
    {
      id: 'click', sys: 'studio', name: 'Agent Studio', action: 'Click Redeliver',
      lines: [
        'Open a delivery and click <b>Redeliver now</b>.',
        'Needs the <code>webhooks:redeliver</code> permission (Developer or Tenant Admin).',
      ],
      ids: { 'Original delivery': ID.deliveryId },
      data: { button: 'Redeliver now', delivery: ID.deliveryId, user: 'dev-jane@acme.io' },
    },
    {
      id: 'admin', sys: 'server', name: 'Admin API', action: 'Signs a claim',
      lines: [
        'Loads the saved call.',
        'Signs a claim: valid 5 minutes, <b>one use</b> only.',
      ],
      stop: 'Already being redelivered → 409, nothing is sent.',
      ids: { 'Original delivery': ID.deliveryId },
      data: { endpoint: `POST …/incomings/${ID.deliveryId}/redeliver`, claim: { signed: 'HMAC', expires: '5 min', uses: 1 } },
    },
    {
      id: 'server', sys: 'server', name: 'Xians Server', action: 'Calls itself', req: true,
      lines: [
        'POSTs the saved body and headers to the webhook\'s own URL.',
        'Gives the call a <b>new request ID</b>.',
      ],
      ids: { 'New request ID': ID.newRequestId },
      data: { url: '(the webhook\'s own URL, on the server\'s own address)', header: 'X-Xians-Redelivery: <signed claim>', requestId: ID.newRequestId },
    },
    {
      id: 'mongo', sys: 'mongo', name: 'MongoDB', action: 'Saves a new row', req: true,
      lines: [
        'A new delivery row, linked to the original.',
        'The original row stays unchanged.',
      ],
      ids: { 'New delivery': ID.newDeliveryId, 'Redelivery of': ID.deliveryId },
      data: { _id: ID.newDeliveryId, request_id: ID.newRequestId, redelivery_of: ID.deliveryId, triggered_by: 'dev-jane@acme.io' },
    },
    {
      id: 'integrator', sys: 'integrator', name: 'Integrator Workflow', action: 'Queues it', req: true,
      lines: ['Same as a call from GitHub: the long-lived workflow hands it to the agent.'],
      ids: { 'Workflow': ID.integrator },
      data: { workflowId: ID.integrator, requestId: ID.newRequestId },
    },
    {
      id: 'agent', sys: 'handler', name: 'Agent', action: 'Checks & matches', req: true,
      lines: [
        'Verifies the signature and matches <code>rules.json</code> again.',
        'Answers <b>200</b>.',
      ],
      ids: { 'Request ID': ID.newRequestId },
      data: { signature: 'passed', matched: 'github-pull-request-review', reply: { status: 200 } },
    },
    {
      id: 'processing', sys: 'processing', name: 'Processing Workflow', action: 'Starts a new run', req: true,
      lines: ['A new run, named after the <b>new</b> request ID.'],
      ids: { 'Run': ID.newProcessing },
      data: { workflowId: ID.newProcessing, memo: { requestId: ID.newRequestId } },
    },
    {
      id: 'executor', sys: 'executor', name: 'Executor', action: 'Reviews again', req: true,
      lines: ['Claude Code reviews the PR again and posts the review.'],
      ids: { 'Request ID': ID.newRequestId },
      data: { plugin: 'pr-reviewer', prompt: '/pr-review 42', pr: 'acme/payments-api#42' },
    },
    {
      id: 'result', sys: 'studio', name: 'Agent Studio', action: 'Shows the result', req: true,
      lines: [
        'Toast: <b>Redelivered · answered 200 in 1.4 s</b>.',
        'The new row has a <b>Redelivery</b> badge and its own Logs.',
      ],
      stop: 'No answer in time → “Could not confirm the redelivery”, and the list refreshes.',
      ids: { 'New delivery': ID.newDeliveryId, 'New request ID': ID.newRequestId },
      data: { toast: 'Redelivered · answered 200 in 1.4 s', newRow: { badge: 'Redelivery', redeliveryOf: ID.deliveryId }, logsLink: `/settings/logs?requestId=${ID.newRequestId}` },
    },
  ]

  const workflows = [
    { id: 'github', name: 'GitHub trigger', blurb: 'A labelled PR gets an AI review.', reqId: ID.requestId, steps },
    { id: 'redeliver', name: 'Redeliver', blurb: 'Re-send a saved call from Agent Studio. It runs again under a new request ID.', reqId: ID.newRequestId, steps: redeliverSteps },
  ]

  window.FLOW = { ID, workflows }
})()
