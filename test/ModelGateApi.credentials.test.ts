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

	it('defaults the base URL to the production ModelGate origin', () => {
		const baseUrl = cred.properties.find((p) => p.name === 'baseUrl');
		expect(baseUrl?.default).toBe('https://api.modelgatehq.com');
	});

	it('builds the Authorization header as a Bearer token from the credential', () => {
		const header = cred.authenticate.properties.headers?.Authorization;
		expect(header).toBe('=Bearer {{$credentials.apiKey}}');
	});

	it('does not hardcode any secret in the authenticate block', () => {
		const serialized = JSON.stringify(cred.authenticate);
		expect(serialized).not.toMatch(/mg_[a-zA-Z0-9]/);
	});

	it('defines a safe, authenticated credential test that normalizes the base URL', () => {
		expect(cred.test).toBeDefined();
		expect(cred.test?.request.method).toBe('GET');
		expect(cred.test?.request.url).toBe('/v1/models');
		// The test must not fire a paid completion.
		expect(cred.test?.request.url).not.toContain('chat/completions');
		expect(String(cred.test?.request.baseURL)).toContain('$credentials.baseUrl');
	});
});
