import type { IAuthenticateGeneric, Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class ModelGateApi implements ICredentialType {
	name = 'modelGateApi';

	displayName = 'ModelGate API';

	icon: Icon = {
		light: 'file:../nodes/ModelGate/modelgate.svg',
		dark: 'file:../nodes/ModelGate/modelgate.dark.svg',
	};

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

	// NOTE: No `test` property is defined — intentionally.
	//
	// An n8n credential test must call an endpoint that actually validates the
	// key AND is safe (free, side-effect-free) to call. The current ModelGate
	// gateway contract offers no such endpoint:
	//   - GET /health responds 200 WITHOUT a key (unauthenticated) so it cannot
	//     verify the credential — it would be a false-positive "test".
	//   - There is no capability-discovery endpoint (GET /v1/models returns 404;
	//     this is the backend's known optional gap E7).
	//   - The only authenticated endpoints are the inference endpoints
	//     (POST /v1/chat/completions, POST /v1/llm/proxy), and firing a real
	//     completion just to validate a key would cost money.
	//
	// Rather than ship a broken (/v1/models) or fake (unauthenticated /health)
	// test, we omit it. The key is validated on the first real request, where the
	// node surfaces 401 `invalid_api_key` clearly. If ModelGate later adds a
	// lightweight authenticated GET endpoint, add a `test: ICredentialTestRequest`
	// targeting it.
	//
	// Because n8n Cloud's strict lint tier requires a credential test that the
	// gateway cannot currently support, this package uses the standard
	// community-node lint tier (cloud support disabled in eslint.config.mjs /
	// package.json). Re-enable strict once a suitable endpoint exists.
}
