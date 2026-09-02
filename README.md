# n8n-nodes-modelgate

This is an [n8n](https://n8n.io) **community node**. It lets you call any LLM through
[ModelGate](https://modelgatehq.com) directly inside your n8n workflows.

ModelGate is an LLM gateway for OpenAI, Anthropic, Google and Azure models. Every
request that flows through it is logged, priced to the token, and audited for
waste — so you get one API key, one billing view, and full observability across
every provider. This node is a **thin adapter**: it turns n8n input into a
ModelGate request, tags it with n8n execution context, and returns the response.
All provider credentials, routing, cost/token accounting and analytics stay
server-side in ModelGate.

> This is an unofficial community node and is **not** an n8n-verified node.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Usage](#usage) · [Metadata & correlation](#metadata--correlation) ·
[Request ID](#request-id) · [Limitations](#limitations) ·
[Development](#development) · [Security](#security-notes)

## Installation

Follow the [n8n community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

In your n8n instance:

1. Go to **Settings → Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-modelgate`.
4. Agree to the risks of using community nodes and select **Install**.

After installation the **ModelGate** node appears in the node picker.

For self-hosted / manual installation:

```bash
npm install n8n-nodes-modelgate
```

## Credentials

Create a **ModelGate API** credential:

| Field    | Required | Default                        | Notes                                                            |
| -------- | -------- | ------------------------------ | ---------------------------------------------------------------- |
| API Key  | Yes      | —                              | Your ModelGate key. It starts with `mg_`. Stored encrypted.      |
| Base URL | No       | `https://gw.modelgatehq.com`   | The gateway **origin** (no path). Override only for staging / self-hosted gateways. A trailing `/v1` is tolerated and de-duplicated. |

The API key is sent as an `Authorization: Bearer <key>` header. It is never
written to logs, error messages or node output.

**Auth header:** the ModelGate gateway accepts both `Authorization: Bearer mg_…`
and `x-api-key: mg_…`. This node uses **Bearer** because it calls the
OpenAI-compatible `/v1/chat/completions` endpoint, where Bearer is the standard
header every OpenAI-compatible client sends; it is verified to be accepted.

**Credential test:** there is **no** credential test. A credential test must call
an endpoint that both validates the key and is safe/free to call, and the gateway
currently exposes none: `GET /health` is unauthenticated (it would not validate
the key), there is no capability-discovery endpoint (`GET /v1/models` returns
404), and the only authenticated endpoints are paid inference endpoints. Rather
than ship a broken or false-positive test, the key is validated on the first real
request, which surfaces a clear `401 invalid_api_key` for a bad key.

## Operations

For this first version the node focuses on doing one thing robustly:

- **Chat / Generate** — send a prompt or a full chat conversation to a model and
  get the completion back.

You do **not** choose a provider (OpenAI vs Anthropic vs …). You pick a **model**,
and ModelGate routes it. This keeps the node experience simple: *ModelGate + model*.

## Usage

### 1. Simple Prompt (default)

- **Input Mode**: `Simple Prompt`
- **Model**: e.g. `gpt-5`, `claude-sonnet-5`, `gemini-2.5-pro` (free-form — any model your ModelGate account supports)
- **Prompt**: the text to send (expression-friendly, e.g. `={{ $json.question }}`)
- **System Prompt** *(optional)*: instructions prepended as a system message

The node builds:

```json
[{ "role": "user", "content": "<your prompt>" }]
```

### 2. Define Messages

- **Input Mode**: `Define Messages`
- Add one or more messages, each with a **Role** (`system` / `user` / `assistant`)
  and **Content**. Contents are expression-friendly.

### Options (collapsed by default)

| Option              | Maps to (request body)     |
| ------------------- | -------------------------- |
| Temperature         | `temperature`              |
| Maximum Tokens      | `max_tokens`               |
| Top P               | `top_p`                    |
| Frequency Penalty   | `frequency_penalty`        |
| Presence Penalty    | `presence_penalty`         |
| Response Format     | `response_format.type` (`json_object` when set) |
| Timeout (Ms)        | request timeout (default 60000) |
| Metadata            | merged into ModelGate `metadata` (see below) |

Only options you actually set are sent.

### Example workflow

An importable example lives in
[`examples/modelgate-example-workflow.json`](examples/modelgate-example-workflow.json):

**Manual Trigger → Set (prompt) → ModelGate**

Import it via **Workflows → Import from File**, then attach your ModelGate
credential to the ModelGate node.

### Request mapping

A Simple Prompt request produces:

```json
{
  "model": "gpt-5",
  "messages": [{ "role": "user", "content": "Hello" }],
  "stream": false,
  "metadata": {
    "source": "n8n",
    "workflow_id": "…",
    "workflow_name": "…",
    "execution_id": "…",
    "execution_mode": "manual",
    "node_name": "ModelGate",
    "node_type": "n8n-nodes-modelgate.modelGate",
    "node_type_version": 1
  }
}
```

sent to `POST {baseUrl}/v1/chat/completions`.

### Output

With **Simplify Output** on (default) each item returns:

```json
{
  "text": "…assistant reply…",
  "model": "gpt-5",
  "finish_reason": "stop",
  "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 },
  "_modelgate": { "requestId": "…" }
}
```

With **Simplify Output** off, the full OpenAI-compatible response body is
preserved unchanged (`id`, `object`, `choices`, `usage`, `model`, …) with a single
added namespaced key:

```json
{
  "id": "chatcmpl-…",
  "choices": [ … ],
  "usage": { … },
  "model": "gpt-5",
  "_modelgate": { "requestId": "…" }
}
```

## Metadata & correlation

Every request this node sends is tagged so it can be attributed to n8n in
ModelGate's analytics. The node always sends `"source": "n8n"` and, on a
best-effort basis, the workflow / execution / node identity shown above.

- **Best-effort:** if any piece of context is unavailable, it is simply omitted —
  execution never fails because of missing metadata.
- **User metadata:** you can add your own key/value pairs under
  **Options → Metadata**. They are merged into the request metadata, but the
  reserved n8n attribution keys (`source`, `workflow_id`, `workflow_name`,
  `execution_id`, `execution_mode`, `node_name`, `node_type`,
  `node_type_version`) can never be overwritten, so attribution stays intact.
- **Never in the prompt:** metadata is only ever sent in ModelGate's `metadata`
  field. It is never injected into your messages or prompt.

This context is enough to later correlate ModelGate analytics with the exact n8n
workflow and node — which is what makes future platform-native recommendations
possible. This node does **not** implement any recommendation logic itself.

## Request ID

ModelGate returns an `x-modelgate-request-id` header on every response for
correlation and debugging. The node captures it and exposes it — without mutating
the OpenAI-compatible response shape — under a namespaced key:

```json
"_modelgate": { "requestId": "…" }
```

The `_modelgate` key was chosen because it does not collide with any
OpenAI-compatible response field, so downstream nodes and expressions keep working
on the standard response while still having access to the request id. When the
request fails, the request id (when present) is included in the error details too.

## Multiple items & error handling

- The node processes **each input item** and returns one output item per input,
  with correct `pairedItem` linking so downstream expressions resolve correctly.
- If **Continue On Fail** is enabled, a failing item produces an item with an
  `error` field (and `_modelgate.requestId` / `statusCode` when available) instead
  of stopping the workflow.
- Errors map ModelGate/HTTP status codes (400, 401, 403, 429, 5xx), connection
  errors and timeouts to clear messages, preserving ModelGate's machine-readable
  error body and request id — **never** the API key or request headers.

## Limitations

- **Non-streaming only.** Requests are sent with `stream: false`. Streaming may be
  added in a future version.
- **No agentic tool-calling framework.** Advanced `tools` / function-calling flows
  are out of scope for V1.
- **`/v1/llm/proxy` is not used.** The node uses the OpenAI-compatible
  `/v1/chat/completions` endpoint for the normal experience.
- **No independent retries.** The node does not add its own retry loop (to avoid
  duplicate, billable calls); rely on n8n's built-in retry settings if needed.

## Development

Requirements: **Node.js >= 20.15** (LTS recommended) and npm.

```bash
npm install          # install dependencies
npm run build        # compile to dist/ (via @n8n/node-cli)
npm run lint         # run the official n8n node linter
npm test             # run the unit test suite (mocked HTTP)
npm run format       # prettier
```

### Run it inside a local n8n

The package uses the official [`@n8n/node-cli`](https://www.npmjs.com/package/@n8n/node-cli).
To develop against a live local n8n with the node auto-linked and hot-reloaded:

```bash
npm run dev
```

This launches a local n8n instance with `n8n-nodes-modelgate` installed. Open the
printed URL, add a **ModelGate API** credential, drop a **ModelGate** node into a
workflow and execute it.

> `npm run dev` starts a full local n8n runtime, which builds a native dependency
> (`isolated-vm`). If it fails to compile, use an LTS Node version (20 or 22).
> `build`, `lint` and `test` do **not** need it.

### Testing

- **Unit tests** (`npm test`) use mocked HTTP — no API key required. They cover
  credential/auth construction, request mapping, metadata, response mapping,
  request-id handling, multiple items, item linking, error handling and security
  invariants (no key/headers leaked, no metadata in prompts).
- **Live integration test** (`npm run test:e2e`) is optional and only runs when
  you supply real credentials via environment variables:

  ```bash
  export MODELGATE_E2E_API_KEY=mg_your_key
  export MODELGATE_E2E_BASE_URL=https://gw.modelgatehq.com   # optional
  export MODELGATE_E2E_MODEL=gpt-5                            # optional
  npm run test:e2e
  ```

  It performs one minimal completion and verifies the full flow:
  request builder → ModelGate API → response → `x-modelgate-request-id`.
  It is never run in CI and makes exactly one small paid call.

## Security notes

- The API key is stored in n8n's encrypted credential store and injected as a
  Bearer header by n8n's authenticated request helper — it never appears in node
  code, logs, errors or output.
- Requests are only ever sent to the origin configured in the credential
  (default `https://gw.modelgatehq.com`) with a fixed API path appended. Workflow
  data cannot redirect the request to another host.
- Error messages surface ModelGate's safe machine-readable error info and request
  id, but never credentials or request headers.

## Icon

The node ships with a neutral placeholder icon. Replace
`nodes/ModelGate/modelgate.svg` and `nodes/ModelGate/modelgate.dark.svg` with the
official ModelGate logo before publishing if desired.

## License

[MIT](LICENSE)
