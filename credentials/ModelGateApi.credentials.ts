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
			default: 'https://api.modelgatehq.com',
			description:
				'The ModelGate API origin. Change this only to target a staging or self-hosted ModelGate environment.',
		},
	];

	// The API key is injected as a Bearer token by n8n's authenticated request
	// helper, so the raw key never appears in the node code, logs or output.
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
	// A test must hit an endpoint that actually validates the key and is safe to
	// call. We deliberately do NOT fire a real completion (that would cost money)
	// and do NOT rely on an unauthenticated /health check (it would not validate
	// the key). ModelGate exposes an OpenAI-compatible surface under /v1, so we
	// use the standard authenticated, free, side-effect-free models listing.
	//
	// If a ModelGate deployment does not expose GET /v1/models, this test may
	// report a valid key as invalid; in that case the endpoint below is the only
	// thing to adjust — the node itself validates on the first real request.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/v1/models',
			method: 'GET',
		},
	};
}
