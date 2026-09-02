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

	it('intentionally defines no credential test (no safe authenticated endpoint exists)', () => {
		// The gateway offers no safe, authenticated, zero-cost endpoint to test a
		// key: /health is unauthenticated, /v1/models does not exist, and the only
		// authenticated endpoints are paid inference endpoints. We deliberately omit
		// the test rather than ship a broken or false-positive one.
		expect((cred as unknown as { test?: unknown }).test).toBeUndefined();
	});
});
