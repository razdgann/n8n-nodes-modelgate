import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ModelGateApi implements ICredentialType {
	name = 'modelGateApi';

	displayName = 'ModelGate API';

	icon: Icon = 'file:../nodes/ModelGate/modelgate.svg';

	documentationUrl = 'https://modelgatehq.com';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your ModelGate API key. It starts with "mg_".',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://gw.modelgatehq.com',
			description:
				'The ModelGate gateway origin (no path). The node appends /v1/chat/completions. Change this only to target a staging or self-hosted ModelGate gateway.',
		},
	];

	// Authentication.
	//
	// The ModelGate gateway accepts BOTH `Authorization: Bearer mg_...` and
	// `x-api-key: mg_...`. We use Bearer because the node calls the
	// OpenAI-compatible `/v1/chat/completions` endpoint, and Bearer is the
	// standard header every OpenAI-compatible client sends to that surface. It is
	// verified to be accepted by the gateway. The key is injected here by n8n's
	// authenticated request helper, so the raw key never appears in node code,
	// logs, errors or output.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Credential test.
	//
	// The ModelGate gateway exposes no free, authenticated, side-effect-free
	// endpoint to validate a key against:
	//   - GET /health (and /v1/status) respond 200 WITHOUT a key, so they would
	//     false-positive.
	//   - There is no capability-discovery endpoint (GET /v1/models returns 404).
	//   - The only authenticated endpoints are the inference endpoints.
	// n8n treats any non-2xx test response as a failure, so the test must hit an
	// endpoint that returns 2xx for a valid key. We therefore send the smallest
	// possible real completion to /v1/chat/completions: a single-token prompt
	// with `max_tokens: 1` and streaming off. This runs only when the user
	// clicks "Test"/saves the credential and generates a negligible provider
	// charge (~1 token). An invalid key returns 401 before any provider is
	// called. The Base URL is normalised the same way as the node
	// (see buildChatCompletionsUrl): a trailing slash or `/v1` is stripped so we
	// never produce `.../v1/v1/chat/completions`. The API key is injected by the
	// `authenticate` block above, so it never appears in this request definition.
	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			url: '={{$credentials.baseUrl.replace(/\\/+$/, "").replace(/\\/v1$/, "") + "/v1/chat/completions"}}',
			body: {
				model: 'gpt-4o-mini',
				messages: [{ role: 'user', content: 'ping' }],
				max_tokens: 1,
				stream: false,
			},
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 401,
					message: 'ModelGate rejected the API key (401). Check that it is correct and active.',
				},
			},
			{
				type: 'responseCode',
				properties: {
					value: 403,
					message: 'ModelGate denied the request (403). The key may lack permission or a limit was hit.',
				},
			},
		],
	};
}
