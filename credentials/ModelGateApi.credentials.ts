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
				'The ModelGate gateway origin (no path). The node appends /v1/chat/completions. A custom gateway must support GET /v1/me for credential verification.',
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

	// Verify key identity without making a provider request.
	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			url: '={{$credentials.baseUrl.replace(/\\/+$/, "").replace(/\\/v1$/, "") + "/v1/me"}}',
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 404,
					message: 'This gateway does not expose GET /v1/me. Check the Base URL and gateway version.',
				},
			},
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
					message: 'ModelGate denied the request (403). Check whether the deployment or its access policy permits credential verification.',
				},
			},
		],
	};
}
