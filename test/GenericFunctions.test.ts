import {
	buildChatCompletionsUrl,
	buildMessagesFromPrompt,
	buildMetadata,
	extractRequestId,
	extractText,
	MODELGATE_SOURCE,
	normalizeBaseUrl,
	normalizeMessages,
	parseModelGateError,
	RESERVED_METADATA_KEYS,
} from '../nodes/ModelGate/GenericFunctions';

describe('normalizeBaseUrl', () => {
	it('strips trailing slashes', () => {
		expect(normalizeBaseUrl('https://gw.modelgatehq.com/')).toBe('https://gw.modelgatehq.com');
		expect(normalizeBaseUrl('https://gw.modelgatehq.com///')).toBe('https://gw.modelgatehq.com');
	});

	it('trims whitespace', () => {
		expect(normalizeBaseUrl('  https://gw.modelgatehq.com  ')).toBe('https://gw.modelgatehq.com');
	});

	it('falls back to the gateway default when empty', () => {
		expect(normalizeBaseUrl('')).toBe('https://gw.modelgatehq.com');
		expect(normalizeBaseUrl(undefined as unknown as string)).toBe('https://gw.modelgatehq.com');
	});

	it('preserves a custom host', () => {
		expect(normalizeBaseUrl('https://staging.example.com/')).toBe('https://staging.example.com');
	});
});

describe('buildChatCompletionsUrl', () => {
	it('appends the chat completions path to the gateway origin', () => {
		expect(buildChatCompletionsUrl('https://gw.modelgatehq.com/')).toBe(
			'https://gw.modelgatehq.com/v1/chat/completions',
		);
	});

	it('does not double the /v1 segment when the base already ends in /v1', () => {
		expect(buildChatCompletionsUrl('https://gw.modelgatehq.com/v1')).toBe(
			'https://gw.modelgatehq.com/v1/chat/completions',
		);
		expect(buildChatCompletionsUrl('https://gw.modelgatehq.com/v1/')).toBe(
			'https://gw.modelgatehq.com/v1/chat/completions',
		);
	});

	it('respects a custom base URL', () => {
		expect(buildChatCompletionsUrl('http://localhost:8080')).toBe(
			'http://localhost:8080/v1/chat/completions',
		);
	});
});

describe('buildMessagesFromPrompt', () => {
	it('wraps a prompt as a single user message', () => {
		expect(buildMessagesFromPrompt('Hi')).toEqual([{ role: 'user', content: 'Hi' }]);
	});

	it('prepends a system message when provided', () => {
		expect(buildMessagesFromPrompt('Hi', 'Be brief')).toEqual([
			{ role: 'system', content: 'Be brief' },
			{ role: 'user', content: 'Hi' },
		]);
	});

	it('ignores an empty/whitespace system prompt', () => {
		expect(buildMessagesFromPrompt('Hi', '   ')).toEqual([{ role: 'user', content: 'Hi' }]);
	});
});

describe('normalizeMessages', () => {
	it('keeps valid roles and content', () => {
		expect(
			normalizeMessages([
				{ role: 'system', content: 'sys' },
				{ role: 'assistant', content: 'a' },
				{ role: 'user', content: 'u' },
			]),
		).toEqual([
			{ role: 'system', content: 'sys' },
			{ role: 'assistant', content: 'a' },
			{ role: 'user', content: 'u' },
		]);
	});

	it('defaults unknown roles to user', () => {
		expect(normalizeMessages([{ role: 'tool', content: 'x' }])).toEqual([
			{ role: 'user', content: 'x' },
		]);
	});

	it('drops entries without string content', () => {
		expect(normalizeMessages([{ role: 'user' }, { role: 'user', content: 'ok' }])).toEqual([
			{ role: 'user', content: 'ok' },
		]);
	});
});

describe('buildMetadata', () => {
	it('always includes source=n8n', () => {
		const md = buildMetadata({});
		expect(md.source).toBe(MODELGATE_SOURCE);
		expect(md.source).toBe('n8n');
	});

	it('captures available execution context', () => {
		const md = buildMetadata({
			workflowId: 'wf_9',
			workflowName: 'My Flow',
			executionId: 'exec_9',
			executionMode: 'trigger',
			nodeName: 'ModelGate',
			nodeType: 'n8n-nodes-modelgate.modelGate',
			nodeTypeVersion: 1,
		});
		expect(md).toMatchObject({
			source: 'n8n',
			workflow_id: 'wf_9',
			workflow_name: 'My Flow',
			execution_id: 'exec_9',
			execution_mode: 'trigger',
			node_name: 'ModelGate',
			node_type: 'n8n-nodes-modelgate.modelGate',
			node_type_version: 1,
		});
	});

	it('omits missing context fields rather than sending empty values', () => {
		const md = buildMetadata({ workflowId: 'wf_9' });
		expect(md).toHaveProperty('workflow_id', 'wf_9');
		expect(md).not.toHaveProperty('workflow_name');
		expect(md).not.toHaveProperty('execution_id');
	});

	it('merges user metadata for non-reserved keys', () => {
		const md = buildMetadata({ workflowId: 'wf_9' }, [{ key: 'team', value: 'growth' }]);
		expect(md.team).toBe('growth');
	});

	it('never lets user metadata overwrite reserved attribution keys', () => {
		const md = buildMetadata({ workflowId: 'wf_9', nodeName: 'ModelGate' }, [
			{ key: 'source', value: 'zapier' },
			{ key: 'workflow_id', value: 'HACKED' },
			{ key: 'node_name', value: 'evil' },
		]);
		expect(md.source).toBe('n8n');
		expect(md.workflow_id).toBe('wf_9');
		expect(md.node_name).toBe('ModelGate');
	});

	it('skips blank user metadata keys', () => {
		const md = buildMetadata({}, [{ key: '  ', value: 'x' }, { value: 'y' }]);
		expect(Object.keys(md)).toEqual(['source']);
	});

	it('exposes the reserved key list for safety', () => {
		expect(RESERVED_METADATA_KEYS).toContain('source');
		expect(RESERVED_METADATA_KEYS).toContain('workflow_id');
		expect(RESERVED_METADATA_KEYS).toContain('node_type');
	});
});

describe('extractRequestId', () => {
	it('reads the header case-insensitively', () => {
		expect(extractRequestId({ 'X-ModelGate-Request-Id': 'req_1' })).toBe('req_1');
		expect(extractRequestId({ 'x-modelgate-request-id': 'req_2' })).toBe('req_2');
	});

	it('handles array header values', () => {
		expect(extractRequestId({ 'x-modelgate-request-id': ['req_3'] })).toBe('req_3');
	});

	it('returns undefined when absent', () => {
		expect(extractRequestId({ 'content-type': 'application/json' })).toBeUndefined();
		expect(extractRequestId(undefined)).toBeUndefined();
	});
});

describe('extractText', () => {
	it('returns the first choice content', () => {
		expect(
			extractText({ choices: [{ message: { role: 'assistant', content: 'hello' } }] }),
		).toBe('hello');
	});

	it('returns empty string when no content is present', () => {
		expect(extractText({})).toBe('');
		expect(extractText(undefined)).toBe('');
		expect(extractText({ choices: [{ message: { content: null } }] })).toBe('');
	});
});

describe('parseModelGateError', () => {
	it('maps known status codes to friendly messages', () => {
		expect(parseModelGateError({ response: { statusCode: 401 } }).message).toContain('401');
		expect(parseModelGateError({ response: { statusCode: 429 } }).message).toContain('429');
		expect(parseModelGateError({ response: { statusCode: 400 } }).message).toContain('400');
	});

	it('extracts the ModelGate request id from error headers', () => {
		const parsed = parseModelGateError({
			response: {
				statusCode: 500,
				headers: { 'x-modelgate-request-id': 'req_err' },
			},
		});
		expect(parsed.requestId).toBe('req_err');
		expect(parsed.description).toContain('req_err');
	});

	it('surfaces a flat gateway error body { error: "invalid_api_key" }', () => {
		const parsed = parseModelGateError({
			response: { statusCode: 401, body: { error: 'invalid_api_key' } },
		});
		expect(parsed.description).toContain('invalid_api_key');
		expect(parsed.errorCode).toBe('invalid_api_key');
	});

	it('surfaces the provider error message and code from the body', () => {
		const parsed = parseModelGateError({
			response: {
				statusCode: 400,
				body: { error: { message: 'model not found', code: 'model_not_found' } },
			},
		});
		expect(parsed.description).toContain('model not found');
		expect(parsed.errorCode).toBe('model_not_found');
	});

	it('handles connection errors without a status code', () => {
		const parsed = parseModelGateError({ code: 'ECONNREFUSED', message: 'connect refused' });
		expect(parsed.message).toContain('ECONNREFUSED');
	});

	it('never includes credential material', () => {
		const parsed = parseModelGateError({
			response: {
				statusCode: 401,
				headers: { authorization: 'Bearer mg_secret', 'x-modelgate-request-id': 'req_x' },
				body: { error: { message: 'unauthorized' } },
			},
		});
		const serialized = JSON.stringify(parsed);
		expect(serialized).not.toContain('mg_secret');
		expect(serialized).not.toContain('Bearer');
		expect(serialized).not.toMatch(/authorization/i);
	});
});
