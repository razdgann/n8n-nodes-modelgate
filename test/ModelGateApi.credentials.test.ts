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

	it('checks key identity without sending a completion', () => {
		expect(cred.test.request.method).toBe('GET');
		expect(cred.test.request.body).toBeUndefined();
	});

	it('targets the /v1/me endpoint and normalises the base URL', () => {
		const url = cred.test.request.url as string;
		// Mirrors buildChatCompletionsUrl: strips a trailing slash or /v1 before
		// appending the fixed path so we never produce .../v1/v1/me.
		expect(url).toContain('/v1/me');
		expect(url).toContain('$credentials.baseUrl');
		expect(url).toContain('replace(/\\/v1$/');
	});

	it('defines errors for rejected credentials and unsupported gateways', () => {
		const codes = (cred.test.rules ?? []).map((r) => (r as { properties: { value: number } }).properties.value);
		expect(codes).toContain(401);
		expect(codes).toContain(403);
		expect(codes).toContain(404);
	});

	it('does not hardcode any secret in the credential test', () => {
		const serialized = JSON.stringify(cred.test);
		expect(serialized).not.toMatch(/mg_[a-zA-Z0-9]/);
	});
});
