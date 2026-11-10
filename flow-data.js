/*
 * The Xians webhook flow, step by step, traced from the code in:
 *   XiansAi.Server  (main)     — the HTTP edge, recording, signal-with-start, waiting for the reply
 *   XiansAi.Lib     (main)     — BuiltinWorkflow (the Integrator Workflow) and the webhook activity
 *   the-agent       (main+659) — the Xianix AI-DLC Agent: verification, rules, Processing Workflow
 *   agent-studio    (main)     — the Deliveries page
 * Every "data" block is a sample of what exists at that point. Values are made up; shapes are real.
 */
(function () {
  const ID = {
    tenant: 'acme',
    agent: 'Xianix AI-DLC Agent',
    activation: 'hooks',
    webhook: 'Default',
    apikeyId: '6730b8f2c9e4a1d5f0b2e7c3',
    githubDelivery: '8c3f2e10-7b1d-11f1-9a4c-2f6d0e1b5a77',
    requestId: '3f9a6c2e-41d8-4b7e-9c55-0a1e7d2b8f64',
    incomingId: '019a6b2e-5c41-7a10-9d3e-6f2b1c8e4a90',
    redeliveryRequestId: 'b71e0d4c-9a2f-4c61-8e3b-5d7a1f0c2e98',
    redeliveryIncomingId: '019a6b4f-0e12-7c33-8a51-2b9d4e7f1c06',
    integratorWorkflowId: 'acme:Xianix AI-DLC Agent:Integrator Workflow:hooks',
    containerId: 'f3a91c7d20be',
    workspaceVolume: 'xianix-acme-4be1c0a9d2f3',
    runtimeVolume: 'xianix-acme-runtimes',
  }
  ID.processingWorkflowId = `${ID.tenant}:${ID.agent}:Processing Workflow:${ID.activation}:${ID.requestId}`
  ID.redeliveryProcessingWorkflowId = `${ID.tenant}:${ID.agent}:Processing Workflow:${ID.activation}:${ID.redeliveryRequestId}`

  // The evaluator's own message (TheAgent/Rules/WebhookRulesEvaluator.cs), first sentence.
  const NO_MATCH = 'No execution matched the webhook payload. None of the match-any conditions passed in any rule block.'

  const WEBHOOK_PATH =
    `/api/user/webhooks/builtin?apikeyId=${ID.apikeyId}&timeoutSeconds=30` +
    `&agentName=Xianix%20AI-DLC%20Agent&workflowName=Integrator%20Workflow` +
    `&webhookName=Default&activationName=hooks`

  const GITHUB_PAYLOAD = {
    action: 'labeled',
    number: 42,
    label: { name: 'ai-dlc/pr/pr-review' },
    pull_request: {
      number: 42,
      state: 'open',
      title: 'Add idempotency keys to payment capture',
      head: { ref: 'feat/idempotent-capture', sha: '9d1c4e7…' },
      base: { ref: 'main' },
      labels: [{ name: 'ai-dlc/pr/pr-review' }],
    },
    repository: {
      full_name: 'acme/payments-api',
      clone_url: 'https://github.com/acme/payments-api.git',
    },
    sender: { login: 'dev-jane' },
  }

  const GITHUB_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'GitHub-Hookshot/7a2b3c4',
    'X-GitHub-Event': 'pull_request',
    'X-GitHub-Delivery': ID.githubDelivery,
    'X-GitHub-Hook-ID': '512340987',
    'X-Hub-Signature-256': 'sha256=4f1d…c9a2',
  }

  /** Where each piece of work happens. Order is top to bottom in the diagram. */
  const lanes = [
    { id: 'github', name: 'GitHub', short: 'GitHub', sub: 'event source' },
    { id: 'studio', name: 'Agent Studio', short: 'Studio', sub: 'Next.js UI' },
    { id: 'server', name: 'XiansAi.Server', short: 'Server', sub: 'HTTP edge' },
    { id: 'mongo', name: 'MongoDB', short: 'MongoDB', sub: 'webhook_incomings' },
    { id: 'integrator', name: 'Integrator Workflow', short: 'Integrator', sub: 'Temporal · builtin, long-lived' },
    { id: 'handler', name: 'Agent webhook handler', short: 'Handler', sub: 'Temporal activity' },
    { id: 'processing', name: 'Processing Workflow', short: 'Processing', sub: 'Temporal · one per match' },
    { id: 'executor', name: 'Executor container', short: 'Executor', sub: 'Docker · Claude Code' },
  ]

  /**
   * Steps. `data` is the debug point: what you would see if you paused right here.
   * `ids` lists the identifiers known at this point (keys into ID).
   * `pr` marks behaviour that comes from an open PR rather than main.
   */
  const steps = {
    redeliver: {
      lane: 'studio',
      short: 'Redeliver',
      title: 'A developer clicks Redeliver in Agent Studio',
      pr: 'Redelivery is in review: XiansAi.Server #666 and agent-studio #175.',
      what: [
        'A Developer (TenantUser) or Tenant Admin opens a delivery and confirms "Redeliver now".',
        'Studio checks the <code>webhooks:redeliver</code> capability, then calls the Admin API with the service key and <code>X-On-Behalf-Of</code>.',
        'The server loads the stored call, signs a 5-minute claim (HMAC) and POSTs the stored body and headers to the webhook\'s own URL on its own address — never a host from the request.',
        'From here the call takes the normal path, so authentication, rate limiting, activation checks and the agent all run again.',
      ],
      where: [
        ['agent-studio', 'src/app/api/integrations/[integrationId]/deliveries/[deliveryId]/redeliver/route.ts'],
        ['XiansAi.Server', 'Features/AdminApi/Endpoints/AdminAppIntegrationEndpoints.cs — POST …/incomings/{id}/redeliver'],
        ['XiansAi.Server', 'Shared/Services/WebhookRedeliveryService.cs — RedeliverAsync, BuildRequest'],
        ['XiansAi.Server', 'Shared/Services/WebhookRedeliverySigner.cs — Sign'],
      ],
      ids: ['incomingId'],
      data: {
        adminRequest: `POST /api/v1/admin/tenants/acme/webhooks/{integrationId}/incomings/${ID.incomingId}/redeliver`,
        headers: { Authorization: 'Bearer sk-Xnai-•••• (Studio service key)', 'X-On-Behalf-Of': 'dev-jane@acme.io' },
        signedClaim: {
          t: ID.tenant,
          i: '{integrationId}',
          o: ID.incomingId,
          r: ID.requestId,
          n: ID.redeliveryIncomingId,
          u: 'dev-jane@acme.io',
          e: '<now + 5 min, unix seconds>',
        },
        loopbackRequest: {
          method: 'POST',
          url: `http://localhost:5000${WEBHOOK_PATH}`,
          addedHeaders: {
            'X-Xians-Redelivery': '<base64url(claim)>.<base64url(HMAC-SHA256)>',
            'X-Xians-Redelivery-Of': ID.incomingId,
          },
          body: '(the stored body, byte for byte as recorded)',
        },
      },
    },

    github: {
      lane: 'github',
      short: 'Label added',
      title: 'GitHub sends the webhook',
      what: [
        'Someone adds the <code>ai-dlc/pr/pr-review</code> label to PR #42.',
        'GitHub POSTs the event to the builtin webhook URL copied from the connection in Agent Studio.',
        'The URL names the agent, activation, workflow and webhook. <code>apikeyId</code> is the credential.',
        'GitHub waits about 10 seconds for an answer, then marks the delivery as timed out (it does not resend on its own).',
      ],
      where: [['GitHub', 'Repository → Settings → Webhooks → Recent Deliveries']],
      ids: ['githubDelivery'],
      data: {
        method: 'POST',
        url: `https://api.xians.example${WEBHOOK_PATH}`,
        headers: GITHUB_HEADERS,
        body: GITHUB_PAYLOAD,
      },
    },

    auth: {
      lane: 'server',
      short: 'Auth',
      title: 'Rate limit and authentication',
      what: [
        'Rate limiting runs first (<code>.WithAgentUserApiRateLimit()</code>), so credential guessing is throttled.',
        'The UserApi authentication handler sees <code>apikeyId</code> in the query, looks the key up and authenticates as its owner. The tenant comes from the key.',
        'Without <code>apikeyId</code> it falls back to <code>Authorization: Bearer &lt;api-key&gt;</code>, then the deprecated <code>?apikey=</code>.',
        'A bad or revoked key stops here with 401: nothing is recorded and no workflow runs.',
      ],
      where: [
        ['XiansAi.Server', 'Features/UserApi/Auth/EndpointAuthenticationHandler.cs — HandleAuthenticateAsync'],
        ['XiansAi.Server', 'Features/UserApi/Endpoints/WebhookEndpoints.cs — .RequireAuthorization("EndpointAuthPolicy")'],
      ],
      ids: ['githubDelivery'],
      data: {
        path: '/api/user/webhooks/builtin',
        credentialSource: 'query: apikeyId (logs a deprecation warning)',
        apikeyId: ID.apikeyId,
        resolved: { tenantId: ID.tenant, apiKeyType: 'webhook', owner: 'webhook-key owner' },
        outcome: 'authenticated',
      },
    },

    endpoint: {
      lane: 'server',
      short: 'Endpoint',
      title: 'Builtin webhook endpoint builds the message',
      what: [
        'Checks <code>workflowName</code>, <code>webhookName</code>, <code>agentName</code> and the timeout (1–300 s).',
        'Checks the activation exists and is active: 404 when missing, 409 when deactivated.',
        'Reads the body as a UTF-8 string and builds the receiving workflow ID <code>{tenant}:{agent}:{workflowName}:{activation}</code>.',
        'Generates a fresh request ID (a new GUID for every call). It ties the reply, the recorded delivery and — with PR #106 — the Processing run together.',
      ],
      where: [
        ['XiansAi.Server', 'Features/UserApi/Endpoints/WebhookEndpoints.cs — MapPost("/api/user/webhooks/builtin")'],
        ['XiansAi.Server', 'Shared/Services/ActivationValidationService — ValidateActivationAsync'],
        ['XiansAi.Server', 'Shared/Utils/MessageRequestProcessor.cs — GenerateRequestId'],
      ],
      ids: ['requestId', 'integratorWorkflowId'],
      data: {
        query: {
          agentName: ID.agent,
          workflowName: 'Integrator Workflow',
          webhookName: ID.webhook,
          activationName: ID.activation,
          timeoutSeconds: 30,
        },
        activationCheck: 'active',
        workflowId: ID.integratorWorkflowId,
        requestId: ID.requestId,
        participantId: 'webhook',
        bodyLength: '1.9 KB',
      },
    },

    record: {
      lane: 'mongo',
      short: 'Record',
      title: 'The delivery is recorded before anything runs',
      what: [
        'Finds the builtin-webhook connection the URL was built from (agent, activation, workflow, webhook name, API key).',
        'Saves one row in <code>webhook_incomings</code>: all headers encrypted as one value (credential headers are masked when read back), the body exactly as received.',
        'Headers over 16 KB or a row over the Mongo limit are truncated and flagged; such calls cannot be redelivered.',
        'Then trims the connection to its newest 100 rows (<code>WebhookIncomings__MaxPerWebhook</code>). Recording never throws, so a Mongo problem never fails the webhook.',
      ],
      where: [
        ['XiansAi.Server', 'Shared/Services/WebhookIncomingService.cs — RecordAsync'],
        ['XiansAi.Server', 'Shared/Repositories/WebhookIncomingRepository.cs — InsertAsync, TrimAsync'],
        ['XiansAi.Server', 'Shared/Data/Models/WebhookIncoming.cs'],
      ],
      ids: ['incomingId', 'requestId', 'integratorWorkflowId'],
      data: {
        collection: 'webhook_incomings',
        document: {
          _id: ID.incomingId,
          tenant_id: ID.tenant,
          integration_id: '6731c0e4a9b2d8f1e5c7a3b0',
          request_id: ID.requestId,
          received_at: '2026-11-10T09:14:03.218Z',
          content_type: 'application/json',
          headers_encrypted: 'djEAAAAQ…(AES, one value)…',
          headers_truncated: false,
          body: JSON.stringify(GITHUB_PAYLOAD).slice(0, 72) + '…',
          body_truncated: false,
          workflow_id: ID.integratorWorkflowId,
        },
        thenTrim: 'keep newest 100 for this connection',
      },
    },

    signal: {
      lane: 'server',
      short: 'Signal',
      title: 'Signal-with-start to the Integrator Workflow, then wait',
      what: [
        'The HTTP headers are copied into the message metadata, so the agent can verify signatures.',
        'The sync handler registers a pending request under the request ID, then sends the message.',
        'The message goes to Temporal as <b>signal-with-start</b>: signal <code>HandleInboundChatOrData</code> on the fixed workflow ID. Temporal starts the workflow if it is not running.',
        'The HTTP request stays open, waiting for a reply with the same request ID, up to <code>timeoutSeconds</code>. On timeout GitHub gets 408.',
      ],
      where: [
        ['XiansAi.Server', 'Shared/Utils/WebhookHeaderCapture.cs — Capture'],
        ['XiansAi.Server', 'Shared/Utils/SyncMessageHandler.cs — ProcessSyncMessageAsync'],
        ['XiansAi.Server', 'Shared/Services/PendingRequestService.cs — WaitForResponseAsync'],
        ['XiansAi.Server', 'Shared/Services/MessageService.cs — SignalWorkflowAsync'],
        ['XiansAi.Server', 'Shared/Services/WorkflowSignalService.cs — SignalWithStartWorkflow'],
      ],
      ids: ['requestId', 'integratorWorkflowId'],
      data: {
        temporal: {
          operation: 'SignalWithStart',
          workflowId: ID.integratorWorkflowId,
          workflowType: 'Xianix AI-DLC Agent:Integrator Workflow',
          signal: 'HandleInboundChatOrData',
        },
        payload: {
          Agent: ID.agent,
          ParticipantId: 'webhook',
          Text: 'Default',
          RequestId: ID.requestId,
          Type: 'Webhook',
          Data: '(raw body string)',
          Metadata: { 'X-GitHub-Event': 'pull_request', 'X-Hub-Signature-256': 'sha256=4f1d…c9a2', '…': '…' },
        },
        pendingRequest: { requestId: ID.requestId, timeoutSeconds: 30 },
      },
    },

    queue: {
      lane: 'integrator',
      short: 'Queue',
      title: 'The Integrator Workflow queues and dispatches the message',
      what: [
        'One long-lived <code>BuiltinWorkflow</code> per activation receives <b>every</b> delivery. Its ID never changes; it continues-as-new when history grows.',
        'The signal handler only enqueues. The run loop dequeues and processes each message as its own task.',
        'Processing happens in an <b>activity</b> (<code>MessageActivities.ProcessAndSendMessageAsync</code>), so the agent\'s code can do I/O and is retried on transient failures.',
        'Because the workflow is shared, its logs mix all deliveries. The request ID appears only in a few debug lines.',
      ],
      where: [
        ['XiansAi.Lib', 'Xians.Lib/Temporal/Workflows/BuiltinWorkflow.cs — HandleInboundChatOrData, ProcessMessagesLoopAsync'],
        ['XiansAi.Lib', 'Xians.Lib/Temporal/Workflows/Messaging/MessageProcessor.cs — ProcessMessageAsync'],
        ['XiansAi.Lib', 'Xians.Lib/Temporal/Workflows/Messaging/MessageActivities.cs — ProcessWebhookAsync'],
      ],
      ids: ['integratorWorkflowId', 'requestId'],
      data: {
        workflowId: ID.integratorWorkflowId,
        queueDepth: { beforeDequeue: 1, afterDequeue: 0 },
        activity: 'MessageActivities.ProcessAndSendMessageAsync',
        webhookContext: {
          Name: 'Default',
          RequestId: ID.requestId,
          TenantId: ID.tenant,
          WorkflowId: ID.integratorWorkflowId,
          Payload: '(raw body string)',
          Metadata: '(inbound headers)',
        },
      },
    },

    verify: {
      lane: 'handler',
      short: 'Verify',
      title: 'The agent verifies the signature',
      what: [
        'The agent\'s <code>OnWebhook</code> handler runs first through the verification gate.',
        'GitHub: recompute HMAC-SHA256 of the raw body with the secret from the tenant Secret Vault and compare it with <code>X-Hub-Signature-256</code>. Azure DevOps: compare a shared header.',
        'No secret configured for the provider → verification is skipped and processing continues.',
        'Mismatch → the agent answers <code>status: ignored</code> and nothing runs.',
      ],
      where: [
        ['the-agent', 'TheAgent/Agent/XianixAgent.cs — ConfigureWebhookWorkflow → OnWebhook'],
        ['the-agent', 'TheAgent/Rules/WebhookVerificationGate.cs — VerifyAsync'],
      ],
      ids: ['requestId'],
      data: {
        provider: 'github',
        header: 'X-Hub-Signature-256',
        secretSource: 'tenant Secret Vault (key named in rules.json)',
        expected: 'sha256=4f1d…c9a2',
        received: 'sha256=4f1d…c9a2',
        result: 'Passed',
      },
    },

    rules: {
      lane: 'handler',
      short: 'Rules',
      title: 'The orchestrator matches the event against rules.json',
      what: [
        'Each execution block in <code>rules.json</code> has <code>match-any</code> rules evaluated against the payload.',
        'For this event, <code>github-pull-request-review</code> matches through <code>github-pr-tag-applied</code>.',
        'Inputs are pulled from the payload (<code>pr-number</code> ← <code>pull_request.number</code>), along with the plugin, prompt, model, budget, env vars and raise-events.',
        'A dedup guard drops an identical match seen in the last 30 seconds.',
      ],
      where: [
        ['the-agent', 'TheAgent/Orchestrator/EventOrchestrator.cs — OrchestrateAsync'],
        ['the-agent', 'TheAgent/Rules/WebhookRulesEvaluator.cs'],
        ['the-agent', 'TheAgent/Knowledge/rules.json — github-pull-request-review'],
        ['the-agent', 'TheAgent/Orchestrator/WebhookDeduplicationGuard.cs — 30 s window'],
      ],
      ids: ['requestId'],
      data: {
        matchedBlock: 'github-pull-request-review',
        matchedRule: "action==labeled&&label.name=='ai-dlc/pr/pr-review'&&pull_request.state=='open'",
        processingRequest: {
          Name: 'Default',
          Type: 'Webhook',
          TenantId: ID.tenant,
          ExecutionBlockName: 'github-pull-request-review',
          Inputs: {
            'pr-number': 42,
            platform: 'github',
            'repository-url': 'https://github.com/acme/payments-api.git',
            'repository-name': 'payments-api',
          },
          Execution: {
            Plugins: ['pr-reviewer@xianix-plugins-official'],
            Prompt: 'You are reviewing pull request #42 in the repository payments-api. Run /pr-review 42 …',
            Model: 'claude-sonnet-4-5',
            MaxBudgetUsd: 3,
            WithEnvs: ['GITHUB-TOKEN ← secrets.GITHUB-TOKEN'],
          },
          RaiseEvents: ['ai-hub-metrics'],
        },
        dedup: 'not seen in the last 30 s → kept',
      },
    },

    start: {
      lane: 'handler',
      short: 'Start run',
      title: 'The handler starts one Processing Workflow per match',
      pr: 'Naming the run after the request ID is the-agent #106. Before it, the last part was a random GUID.',
      what: [
        'For each match the handler calls <code>XiansContext.Workflows.StartAsync&lt;ProcessingWorkflow&gt;</code>.',
        'It runs inside an activity, so the run is started through the Temporal client (not as a child) with <code>IdConflictPolicy.UseExisting</code>.',
        'The run ID ends with the request ID (<code>-2</code>, <code>-3</code>… for further matches). An activity retry while the run is still going attaches to it instead of starting a second review.',
        'The handler does not wait for the review: it only starts it.',
      ],
      where: [
        ['the-agent', 'TheAgent/Agent/XianixAgent.cs — DeliveryRunKey'],
        ['XiansAi.Lib', 'Xians.Lib/Agents/Workflows/SubWorkflowService.cs — StartCoreAsync → StartViaClientAsync'],
      ],
      ids: ['requestId', 'processingWorkflowId'],
      data: {
        call: 'XiansContext.Workflows.StartAsync<ProcessingWorkflow>(new[] { match }, DeliveryRunKey(requestId, 0))',
        uniqueKey: ID.requestId,
        temporal: {
          operation: 'StartWorkflow (client)',
          workflowId: ID.processingWorkflowId,
          workflowType: 'Xianix AI-DLC Agent:Processing Workflow',
          idConflictPolicy: 'UseExisting',
        },
      },
    },

    reply: {
      lane: 'handler',
      short: 'Reply',
      title: 'The handler replies to the server',
      what: [
        '<code>context.Respond(…)</code> sets the HTTP-style response (status, content, headers).',
        'After the handler returns, the Lib always sends it back — success or error — as a <code>Webhook</code> message with the same request ID.',
        'It goes to the server\'s agent API, not to GitHub directly.',
      ],
      where: [
        ['the-agent', 'TheAgent/Agent/XianixAgent.cs — context.Respond'],
        ['XiansAi.Lib', 'Xians.Lib/Temporal/Workflows/Messaging/MessageActivities.cs — SendWebhookResponseAsync'],
        ['XiansAi.Lib', 'POST api/agent/conversation/outbound'],
      ],
      ids: ['requestId'],
      data: {
        endpoint: 'POST /api/agent/conversation/outbound',
        message: {
          Type: 'Webhook',
          RequestId: ID.requestId,
          WorkflowId: ID.integratorWorkflowId,
          ParticipantId: 'webhook',
          Data: {
            StatusCode: 200,
            ContentType: 'application/json',
            Content: {
              status: 'success',
              matchCount: 1,
              matches: [{ ExecutionBlockName: 'github-pull-request-review', inputs: { 'pr-number': 42 } }],
            },
            Headers: {},
          },
        },
      },
    },

    answer: {
      lane: 'server',
      short: 'Answer',
      title: 'The server answers GitHub',
      what: [
        'The outbound message completes the pending request with the matching request ID (across instances through Redis when configured).',
        'The endpoint reads the <code>WebhookResponse</code> from the reply and writes its status, headers and content to the still-open HTTP response.',
        'GitHub shows the delivery as successful. The review itself is still running in the background.',
      ],
      where: [
        ['XiansAi.Server', 'Shared/Services/PendingRequestService.cs — CompleteRequest'],
        ['XiansAi.Server', 'Features/UserApi/Endpoints/WebhookEndpoints.cs — ApplyToHttpContextAsync'],
      ],
      ids: ['requestId', 'githubDelivery'],
      data: {
        httpResponseToGitHub: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: { status: 'success', matchCount: 1, matches: [{ ExecutionBlockName: 'github-pull-request-review', inputs: { 'pr-number': 42 } }] },
        },
        elapsed: '≈ 1.4 s (GitHub gives up after ~10 s)',
      },
    },

    volumes: {
      lane: 'processing',
      short: 'Volumes',
      title: 'The Processing Workflow prepares the workspace',
      what: [
        'Each step is a Temporal activity, so it is retried and resumable.',
        'One Docker volume per tenant + repository keeps a clone across runs (<code>xianix-{tenant}-{sha256(repoUrl)[:12]}</code>).',
        'One shared per-tenant volume keeps installed runtimes (<code>xianix-{tenant}-runtimes</code>).',
      ],
      where: [
        ['the-agent', 'TheAgent/Workflows/ProcessingWorkflow.cs — ExecuteContainerPipelineAsync'],
        ['the-agent', 'TheAgent/Activities/ContainerActivities.cs — EnsureWorkspaceVolumeAsync, EnsureRuntimeVolumeAsync'],
      ],
      ids: ['processingWorkflowId'],
      data: {
        workflowId: ID.processingWorkflowId,
        input: { Name: 'Default', ExecutionBlockName: 'github-pull-request-review', Inputs: { 'pr-number': 42 } },
        workspaceVolume: { name: ID.workspaceVolume, labels: { 'xianix.tenant': ID.tenant, 'xianix.repository': 'https://github.com/acme/payments-api.git' } },
        runtimeVolume: ID.runtimeVolume,
      },
    },

    container: {
      lane: 'executor',
      short: 'Executor',
      title: 'The executor container runs the review',
      what: [
        'Starts <code>99xio/xianix-executor:latest</code> (<code>EXECUTOR-IMAGE</code>) with both volumes mounted.',
        'Passes the inputs, plugins, prompt, model and budget, and env vars resolved from the Secret Vault (<code>GITHUB-TOKEN</code>).',
        'Inside, Claude Code installs <code>pr-reviewer</code> and runs <code>/pr-review 42</code>.',
        'The workflow waits for the container and collects its output and cost metrics.',
      ],
      where: [
        ['the-agent', 'TheAgent/Activities/ContainerActivities.cs — StartContainerAsync, WaitAndCollectOutputAsync'],
        ['the-agent', 'TheAgent/EnvConfig.cs — ExecutorImage'],
        ['plugins-official', 'plugins/pr-reviewer/commands/pr-review.md'],
      ],
      ids: ['processingWorkflowId', 'containerId'],
      data: {
        image: '99xio/xianix-executor:latest',
        containerId: ID.containerId,
        binds: [ID.workspaceVolume + ':/workspace/repo', ID.runtimeVolume + ':/workspace/runtimes'],
        env: {
          'TENANT-ID': ID.tenant,
          'EXECUTION-ID': 'a3f09c1e',
          'XIANIX-INPUTS': '{"pr-number":42,"platform":"github",…}',
          'CLAUDE-CODE-PLUGINS': '[{"plugin-name":"pr-reviewer@xianix-plugins-official",…}]',
          PROMPT: 'You are reviewing pull request #42 in the repository payments-api. Run /pr-review 42 …',
          'XIANIX-MODEL': 'claude-sonnet-4-5',
          'XIANIX-MAX-BUDGET-USD': '3',
          'GITHUB-TOKEN': '•••• (rules.json with-envs → Secret Vault)',
          'ANTHROPIC-API-KEY': '•••• (host config)',
        },
      },
    },

    posted: {
      lane: 'github',
      short: 'Review',
      title: 'The review lands on the pull request',
      what: [
        'The plugin posts a review summary and one inline comment per finding using <code>gh</code> and the run\'s <code>GITHUB-TOKEN</code>.',
        'This is the outcome the developer sees — minutes after GitHub already got its 200.',
      ],
      where: [['plugins-official', 'plugins/pr-reviewer/scripts/gh-post-review.sh']],
      ids: ['processingWorkflowId'],
      data: {
        github: 'acme/payments-api#42',
        review: { verdict: 'COMMENT', summaryComment: 1, inlineComments: 4 },
        containerExit: 0,
        output: { status: 'completed', costUsd: 0.84, tokens: 182340, durationSeconds: 211 },
      },
    },

    finish: {
      lane: 'processing',
      short: 'Wrap up',
      title: 'Metrics, raise-events and cleanup',
      what: [
        'Parses the container output and reports execution metrics.',
        'Delivers each <code>raise-events</code> entry (here <code>ai-hub-metrics</code>: an HTTP POST with tokens, cost, model and status). Failures are logged, not fatal.',
        'Waits 2 minutes, then removes the container. The volumes stay for the next run.',
      ],
      where: [
        ['the-agent', 'TheAgent/Workflows/ProcessingWorkflow.cs — ReportExecutionMetricsAsync, ReportRaiseEventsAsync'],
        ['the-agent', 'TheAgent/Activities/RaiseEventActivities.cs — DeliverRaiseEventAsync'],
        ['the-agent', 'TheAgent/Activities/ContainerActivities.cs — CleanupContainerAsync'],
      ],
      ids: ['processingWorkflowId'],
      data: {
        raiseEvent: {
          name: 'ai-hub-metrics',
          method: 'POST',
          url: 'https://ai-hub-api.99x.io/metrics/nodes/…/events',
          headers: { 'X-Api-Key': '•••• (secrets.AIHUB-API-KEY)' },
          payload: { correlationId: '…', actors: ['pr-reviewer'], dimensions: { tokens: 182340, costUsd: 0.84, model: 'claude-sonnet-4-5', status: 'completed' } },
        },
        cleanup: { delay: '2 min', container: ID.containerId, removed: true },
      },
    },

    inspect: {
      lane: 'studio',
      short: 'Inspect',
      title: 'Inspect the delivery in Agent Studio',
      what: [
        'Connections → the webhook → Deliveries lists the rows from <code>webhook_incomings</code>, newest first.',
        'Expanding one shows its headers (credentials masked) and payload.',
        '<b>Logs</b> opens the delivery\'s Processing run when it has logs (agent-studio #174), otherwise the Integrator Workflow and its children.',
      ],
      where: [
        ['agent-studio', 'src/app/(dashboard)/settings/connections/[integrationId]/deliveries/page.tsx'],
        ['agent-studio', 'src/app/(dashboard)/settings/connections/components/delivery-detail.tsx'],
        ['XiansAi.Server', 'GET /api/v1/admin/tenants/{tenantId}/webhooks/{integrationId}/incomings[/{id}]'],
      ],
      ids: ['incomingId', 'requestId', 'processingWorkflowId'],
      data: {
        listRow: { id: ID.incomingId, requestId: ID.requestId, receivedAt: '2026-11-10T09:14:03Z', bodyTruncated: false, headersTruncated: false },
        detail: {
          headers: [
            { name: 'X-GitHub-Event', value: 'pull_request' },
            { name: 'X-Hub-Signature-256', value: 'sha256=4f1d…c9a2' },
          ],
          body: '{"action":"labeled","number":42,…}',
          workflowId: ID.integratorWorkflowId,
        },
        logsLink: `/settings/logs?workflowId=${encodeURIComponent(ID.processingWorkflowId)}&children=1`,
      },
    },
  }

  /** Per-scenario replacements for a step's title, text or data. */
  const scenarios = [
    {
      id: 'review',
      name: 'Review runs',
      blurb: 'A labelled PR matches a rule; the agent starts a review.',
      order: ['github', 'auth', 'endpoint', 'record', 'signal', 'queue', 'verify', 'rules', 'start', 'reply', 'answer', 'volumes', 'container', 'posted', 'finish', 'inspect'],
      edges: [
        ['github', 'auth'], ['auth', 'endpoint'], ['endpoint', 'record'], ['record', 'signal'], ['signal', 'queue'],
        ['queue', 'verify'], ['verify', 'rules'], ['rules', 'start'], ['start', 'reply'], ['reply', 'answer'],
        ['start', 'volumes', 'async'], ['volumes', 'container'], ['container', 'posted'], ['posted', 'finish'],
        ['record', 'inspect', 'read'],
      ],
      overrides: {},
    },
    {
      id: 'nomatch',
      name: 'No rule matched',
      blurb: 'A PR is opened without the label: recorded, answered, nothing runs.',
      order: ['github', 'auth', 'endpoint', 'record', 'signal', 'queue', 'verify', 'rules', 'reply', 'answer', 'inspect'],
      edges: [
        ['github', 'auth'], ['auth', 'endpoint'], ['endpoint', 'record'], ['record', 'signal'], ['signal', 'queue'],
        ['queue', 'verify'], ['verify', 'rules'], ['rules', 'reply'], ['reply', 'answer'], ['record', 'inspect', 'read'],
      ],
      overrides: {
        github: {
          title: 'GitHub sends a pull_request "opened" event',
          data: { method: 'POST', url: `https://api.xians.example${WEBHOOK_PATH}`, headers: GITHUB_HEADERS, body: { ...GITHUB_PAYLOAD, action: 'opened', label: undefined, pull_request: { ...GITHUB_PAYLOAD.pull_request, labels: [] } } },
        },
        rules: {
          title: 'No execution block matches',
          what: [
            'Every <code>match-any</code> rule is evaluated; none is true (the PR has no <code>ai-dlc/pr/pr-review</code> label).',
            'The orchestrator returns a skip reason and the handler answers <code>status: ignored</code>.',
            'No Processing Workflow is started.',
          ],
          data: { executionBlocks: 10, matched: 0, skipReason: NO_MATCH },
        },
        reply: { data: { endpoint: 'POST /api/agent/conversation/outbound', message: { Type: 'Webhook', RequestId: ID.requestId, Data: { StatusCode: 200, Content: { status: 'ignored', reason: NO_MATCH } } } } },
        answer: { data: { httpResponseToGitHub: { status: 200, body: { status: 'ignored', reason: NO_MATCH } } } },
        inspect: { data: { listRow: { id: ID.incomingId, requestId: ID.requestId }, logsLink: 'run has no logs → opens the Integrator Workflow instead' } },
      },
    },
    {
      id: 'unverified',
      name: 'Signature fails',
      blurb: 'The HMAC does not match the vault secret: answered ignored, nothing runs.',
      order: ['github', 'auth', 'endpoint', 'record', 'signal', 'queue', 'verify', 'reply', 'answer', 'inspect'],
      edges: [
        ['github', 'auth'], ['auth', 'endpoint'], ['endpoint', 'record'], ['record', 'signal'], ['signal', 'queue'],
        ['queue', 'verify'], ['verify', 'reply'], ['reply', 'answer'], ['record', 'inspect', 'read'],
      ],
      overrides: {
        verify: {
          title: 'Signature verification fails',
          what: [
            'The recomputed HMAC does not equal <code>X-Hub-Signature-256</code> (wrong secret on the GitHub side, or a tampered body).',
            'The agent logs a warning with the request ID and answers <code>status: ignored</code>.',
            'Note: the delivery is still recorded — recording happens on the server before the agent sees it.',
          ],
          data: { provider: 'github', expected: 'sha256=4f1d…c9a2', received: 'sha256=77b0…e1d4', result: 'Failed', reason: 'verification-secret-mismatch' },
        },
        reply: { data: { message: { Type: 'Webhook', RequestId: ID.requestId, Data: { StatusCode: 200, Content: { status: 'ignored', reason: 'Webhook could not be verified.' } } } } },
        answer: { data: { httpResponseToGitHub: { status: 200, body: { status: 'ignored', reason: 'Webhook could not be verified.' } } } },
      },
    },
    {
      id: 'redelivery',
      name: 'Redelivered from Studio',
      blurb: 'A developer re-sends a recorded call. PRs #666 / #175 (in review).',
      order: ['redeliver', 'auth', 'endpoint', 'record', 'signal', 'queue', 'verify', 'rules', 'start', 'reply', 'answer', 'volumes', 'container', 'posted', 'finish', 'inspect'],
      edges: [
        ['redeliver', 'auth'], ['auth', 'endpoint'], ['endpoint', 'record'], ['record', 'signal'], ['signal', 'queue'],
        ['queue', 'verify'], ['verify', 'rules'], ['rules', 'start'], ['start', 'reply'], ['reply', 'answer'],
        ['answer', 'redeliver', 'return'],
        ['start', 'volumes', 'async'], ['volumes', 'container'], ['container', 'posted'], ['posted', 'finish'],
        ['record', 'inspect', 'read'],
      ],
      overrides: {
        auth: { data: { path: '/api/user/webhooks/builtin', caller: 'the server itself (loopback)', credentialSource: 'query: apikeyId (from the stored webhook URL)', resolved: { tenantId: ID.tenant }, outcome: 'authenticated' } },
        endpoint: {
          what: [
            'Same checks as a call from GitHub.',
            'Verifies the <code>X-Xians-Redelivery</code> claim: HMAC, tenant and expiry. An unsigned or forged claim is ignored and the call is recorded as an ordinary delivery.',
            'Gets a <b>new</b> request ID, so the redelivery has its own reply and its own Processing run.',
          ],
          data: { workflowId: ID.integratorWorkflowId, requestId: ID.redeliveryRequestId, redeliveryClaim: { verified: true, redeliveryOf: ID.incomingId, deliveryId: ID.redeliveryIncomingId, triggeredBy: 'dev-jane@acme.io' } },
        },
        record: {
          title: 'Recorded as a redelivery linked to the original',
          data: {
            collection: 'webhook_incomings',
            document: {
              _id: ID.redeliveryIncomingId,
              request_id: ID.redeliveryRequestId,
              redelivery_of: ID.incomingId,
              redelivery_of_request_id: ID.requestId,
              triggered_by: 'dev-jane@acme.io',
              headers_encrypted: '(stored headers + X-Xians-Redelivery-Of; the signed token is never stored)',
              body: '(identical to the original)',
            },
          },
        },
        start: { data: { uniqueKey: ID.redeliveryRequestId, temporal: { workflowId: ID.redeliveryProcessingWorkflowId, idConflictPolicy: 'UseExisting' }, note: 'a new run — the agent reviews the PR again' } },
        answer: {
          title: 'The server answers its own redelivery call',
          data: {
            httpResponse: { status: 200, body: { status: 'success', matchCount: 1 } },
            adminApiResult: { deliveryId: ID.redeliveryIncomingId, redeliveryOf: ID.incomingId, statusCode: 200, durationMs: 1380 },
            studioToast: 'Redelivered · answered 200 in 1.4 s',
          },
        },
        volumes: { data: { workflowId: ID.redeliveryProcessingWorkflowId, workspaceVolume: ID.workspaceVolume + ' (reused)', runtimeVolume: ID.runtimeVolume } },
        inspect: { data: { newRow: { id: ID.redeliveryIncomingId, label: ID.requestId, badge: 'Redelivery', triggeredBy: 'dev-jane@acme.io' }, original: { id: ID.incomingId, unchanged: true } } },
      },
    },
  ]

  /** Every workflow the Xianix agent defines, and its part in the webhook flow. */
  const workflows = [
    {
      name: 'Integrator Workflow',
      kind: 'Builtin (XiansAi.Lib BuiltinWorkflow)',
      inFlow: 'Receives every delivery',
      startedBy: 'XiansAi.Server — signal-with-start on each call',
      id: '{tenant}:{agent}:Integrator Workflow:{activation} — fixed, one per activation',
      lifetime: 'Long-lived queue; continues-as-new when history grows',
      does: 'Queues each message and runs the agent\'s OnWebhook handler in an activity, which replies and starts Processing runs.',
      code: 'XiansAi.Lib · Temporal/Workflows/BuiltinWorkflow.cs; the-agent · XianixAgent.ConfigureWebhookWorkflow',
    },
    {
      name: 'Processing Workflow',
      kind: 'Custom (the-agent)',
      inFlow: 'One per matched rule',
      startedBy: 'Agent webhook handler (client start, UseExisting) — and JobDispatcher for schedules',
      id: '{tenant}:{agent}:Processing Workflow:{activation}:{requestId}[-n] (the-agent #106; random GUID before)',
      lifetime: 'Minutes; ends after cleanup',
      does: 'Volumes → executor container (Claude Code + plugin) → output, metrics, raise-events → cleanup.',
      code: 'the-agent · Workflows/ProcessingWorkflow.cs, Activities/ContainerActivities.cs',
    },
    {
      name: 'CognitiveDispatcher Workflow',
      kind: 'Custom, activable',
      inFlow: 'Not in the webhook path',
      startedBy: 'Activation of the agent',
      id: 'per activation',
      lifetime: 'Short',
      does: 'Reads the schedule rules and creates a Temporal schedule for each (CreateIfNotExists).',
      code: 'the-agent · Workflows/CognitiveDispatcher.cs',
    },
    {
      name: 'JobDispatcher Workflow',
      kind: 'Custom (scheduled)',
      inFlow: 'Parallel path: schedules instead of webhooks',
      startedBy: 'Temporal schedule (cron) created by CognitiveDispatcher',
      id: 'schedule run',
      lifetime: 'Short',
      does: 'Builds a ProcessingRequest of type Schedule for each execution and starts a Processing Workflow (random key).',
      code: 'the-agent · Workflows/JobDispatcherWorkflow.cs',
    },
    {
      name: 'OnboardRepository Workflow',
      kind: 'Custom',
      inFlow: 'Not in the webhook path',
      startedBy: 'A chat tool (fire-and-forget)',
      id: 'sub-workflow',
      lifetime: 'Short',
      does: 'Runs the executor in prepare mode to bare-clone a repo into the tenant volume, so the first review is fast.',
      code: 'the-agent · Workflows/OnboardRepositoryWorkflow.cs',
    },
    {
      name: 'ClaudeCodeChat Workflow',
      kind: 'Custom',
      inFlow: 'Not in the webhook path',
      startedBy: 'A chat tool (fire-and-forget)',
      id: 'sub-workflow',
      lifetime: 'Minutes',
      does: 'Same container pipeline with a free-form prompt and no plugins; streams progress back to the chat.',
      code: 'the-agent · Workflows/ClaudeCodeChatWorkflow.cs',
    },
  ]

  /** How each identifier is born and where it travels. */
  const idTrace = [
    { key: 'githubDelivery', name: 'X-GitHub-Delivery', born: 'GitHub', travels: 'Header only. Stored with the other headers; not used for routing.' },
    { key: 'requestId', name: 'Request ID', born: 'Server endpoint (new GUID per call)', travels: 'Signal payload → webhook context → reply → pending request; recorded row; Processing run ID.' },
    { key: 'incomingId', name: 'Delivery ID', born: 'Server, when recording (UUID v7)', travels: 'webhook_incomings._id; Studio row; redelivery link.' },
    { key: 'integratorWorkflowId', name: 'Integrator workflow ID', born: 'Server endpoint', travels: 'Fixed per activation; every delivery shares it.' },
    { key: 'processingWorkflowId', name: 'Processing workflow ID', born: 'Agent handler', travels: 'Temporal run; Studio Logs link (when it has logs).' },
    { key: 'containerId', name: 'Container ID', born: 'Docker, in StartContainerAsync', travels: 'Processing activities only; removed after 2 min.' },
  ]

  window.FLOW = { ID, lanes, steps, scenarios, workflows, idTrace }
})()
