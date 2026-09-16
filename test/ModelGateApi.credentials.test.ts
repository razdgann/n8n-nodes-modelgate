import { ModelGateApi } from '../credentials/ModelGateApi.credentials';

describe('ModelGateApi credential', () => {
	const cred = new ModelGateApi();

	it('uses the expected internal name and display name', () => {
		expect(cred.name).toBe('modelGateApi');
		expect(cred.displayName).toBe('ModelGate API');
	});

	it('exposes an API key field that is a masked password', () => {
		const apiKey = cred.properties.find((p) => p.name === 'apiKey');
		expect(apiKey).toBeDefined();
		expect(apiKey?.typeOptions?.password).toBe(true);
		expect(apiKey?.type).toBe('string');
	});

	it('defaults the base URL to the production ModelGate gateway origin', () => {
		const baseUrl = cred.properties.find((p) => p.name === 'baseUrl');
		expect(baseUrl?.default).toBe('https://gw.modelgatehq.com');
	});

	it('builds the Authorization header as a Bearer token from the credential', () => {
		const header = cred.authenticate.properties.headers?.Authorization;
		expect(header).toBe('=Bearer {{$credentials.apiKey}}');
	});

	it('does not hardcode any secret in the authenticate block', () => {
		const serialized = JSON.stringify(cred.authenticate);
		expect(serialized).not.toMatch(/mg_[a-zA-Z0-9]/);
	});

	it('defines a credential test that posts a minimal completion to the chat endpoint', () => {
		// The gateway offers no free authenticated endpoint (/health is
		// unauthenticated, /v1/models does not exist), and n8n treats any non-2xx
		// test response as a failure. So the test sends the smallest possible real
		// completion (max_tokens: 1, streaming off) to /v1/chat/completions.
		expect(cred.test).toBeDefined();
		expect(cred.test.request.method).toBe('POST');
		const body = cred.test.request.body as {
			model: string;
			messages: Array<{ role: string; content: string }>;
			max_tokens: number;
			stream: boolean;
		};
		expect(body.max_tokens).toBe(1);
		expect(body.stream).toBe(false);
		expect(body.messages).toHaveLength(1);
		expect(body.model).toBeTruthy();
	});

	it('targets the /v1/chat/completions endpoint and normalises the base URL', () => {
		const url = cred.test.request.url as string;
		// Mirrors buildChatCompletionsUrl: strips a trailing slash or /v1 before
		// appending the fixed path so we never produce .../v1/v1/chat/completions.
		expect(url).toContain('/v1/chat/completions');
		expect(url).toContain('$credentials.baseUrl');
		expect(url).toContain('replace(/\\/v1$/');
	});

	it('surfaces a clear error for an invalid or unauthorised key', () => {
		const codes = (cred.test.rules ?? []).map((r) => (r as { properties: { value: number } }).properties.value);
		expect(codes).toContain(401);
		expect(codes).toContain(403);
	});

	it('does not hardcode any secret in the credential test', () => {
		const serialized = JSON.stringify(cred.test);
		expect(serialized).not.toMatch(/mg_[a-zA-Z0-9]/);
	});
});
