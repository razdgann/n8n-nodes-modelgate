import type { IDataObject } from 'n8n-workflow';
import { ModelGate } from '../nodes/ModelGate/ModelGate.node';
import { createExecuteMock, sampleChatResponse } from './helpers';

function okResponse(requestId = 'req_123', body: Record<string, unknown> = sampleChatResponse()) {
	return { body, headers: { 'x-modelgate-request-id': requestId } };
}

/** Pull the request body sent to httpRequestWithAuthentication for call n. */
function sentOptions(httpMock: jest.Mock, callIndex = 0) {
	return httpMock.mock.calls[callIndex][1] as {
		method: string;
		url: string;
		body: IDataObject;
		json: boolean;
		returnFullResponse: boolean;
		timeout: number;
	};
}

describe('ModelGate node — request mapping', () => {
	it('maps a simple prompt into a user message with source=n8n', async () => {
		const { ctx, httpMock } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: 'gpt-5', prompt: 'Hello', simplify: true, options: {} },
			httpResponse: okResponse(),
		});

		await new ModelGate().execute.call(ctx);

		const opts = sentOptions(httpMock);
		expect(opts.method).toBe('POST');
		expect(opts.url).toBe('https://gw.modelgatehq.com/v1/chat/completions');
		expect(opts.json).toBe(true);
		expect(opts.returnFullResponse).toBe(true);
		expect(opts.body.model).toBe('gpt-5');
		expect(opts.body.stream).toBe(false);
		expect(opts.body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
		expect((opts.body.metadata as IDataObject).source).toBe('n8n');
	});

	it('prepends a system prompt in simple mode', async () => {
		const { ctx, httpMock } = createExecuteMock({
			items: [{ json: {} }],
			params: {
				inputType: 'prompt',
				model: 'gpt-5',
				prompt: 'Hello',
				systemPrompt: 'Be terse',
				simplify: true,
				options: {},
			},
			httpResponse: okResponse(),
		});

		await new ModelGate().execute.call(ctx);

		expect(sentOptions(httpMock).body.messages).toEqual([
			{ role: 'system', content: 'Be terse' },
			{ role: 'user', content: 'Hello' },
		]);
	});

	it('maps a full messages collection', async () => {
		const { ctx, httpMock } = createExecuteMock({
			items: [{ json: {} }],
			params: {
				inputType: 'messages',
				model: 'claude-sonnet-5',
				simplify: true,
				options: {},
				'messages.message': [
					{ role: 'system', content: 'sys' },
					{ role: 'user', content: 'u' },
				],
			},
			httpResponse: okResponse(),
		});

		await new ModelGate().execute.call(ctx);

		const opts = sentOptions(httpMock);
		expect(opts.body.model).toBe('claude-sonnet-5');
		expect(opts.body.messages).toEqual([
			{ role: 'system', content: 'sys' },
			{ role: 'user', content: 'u' },
		]);
	});

	it('maps generation options to the OpenAI-compatible body', async () => {
		const { ctx, httpMock } = createExecuteMock({
			items: [{ json: {} }],
			params: {
				inputType: 'prompt',
				model: 'gpt-5',
				prompt: 'Hi',
				simplify: true,
				options: {
					temperature: 0.2,
					maxTokens: 256,
					topP: 0.9,
					frequencyPenalty: 0.5,
					presencePenalty: -0.5,
					responseFormat: 'json_object',
					timeout: 12000,
				},
			},
			httpResponse: okResponse(),
		});

		await new ModelGate().execute.call(ctx);

		const opts = sentOptions(httpMock);
		expect(opts.body.temperature).toBe(0.2);
		expect(opts.body.max_tokens).toBe(256);
		expect(opts.body.top_p).toBe(0.9);
		expect(opts.body.frequency_penalty).toBe(0.5);
		expect(opts.body.presence_penalty).toBe(-0.5);
		expect(opts.body.response_format).toEqual({ type: 'json_object' });
		expect(opts.timeout).toBe(12000);
	});

	it('omits generation params that were not set and defaults the timeout', async () => {
		const { ctx, httpMock } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: 'gpt-5', prompt: 'Hi', simplify: true, options: {} },
			httpResponse: okResponse(),
		});

		await new ModelGate().execute.call(ctx);

		const opts = sentOptions(httpMock);
		expect(opts.body).not.toHaveProperty('temperature');
		expect(opts.body).not.toHaveProperty('max_tokens');
		expect(opts.body).not.toHaveProperty('response_format');
		expect(opts.timeout).toBe(60000);
	});
});

describe('ModelGate node — metadata', () => {
	it('captures workflow/execution/node context', async () => {
		const { ctx, httpMock } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: 'gpt-5', prompt: 'Hi', simplify: true, options: {} },
			httpResponse: okResponse(),
			workflow: { id: 'wf_42', name: 'Lead Router' },
			node: { name: 'Ask ModelGate', type: 'n8n-nodes-modelgate.modelGate', typeVersion: 1 },
			executionId: 'exec_42',
			mode: 'trigger',
		});

		await new ModelGate().execute.call(ctx);

		const metadata = sentOptions(httpMock).body.metadata as IDataObject;
		expect(metadata).toMatchObject({
			source: 'n8n',
			workflow_id: 'wf_42',
			workflow_name: 'Lead Router',
			execution_id: 'exec_42',
			execution_mode: 'trigger',
			node_name: 'Ask ModelGate',
			node_type: 'n8n-nodes-modelgate.modelGate',
			node_type_version: 1,
		});
	});

	it('merges user metadata but protects reserved keys', async () => {
		const { ctx, httpMock } = createExecuteMock({
			items: [{ json: {} }],
			params: {
				inputType: 'prompt',
				model: 'gpt-5',
				prompt: 'Hi',
				simplify: true,
				options: {
					metadata: {
						metadataValues: [
							{ key: 'customer', value: 'acme' },
							{ key: 'source', value: 'evil' },
						],
					},
				},
			},
			httpResponse: okResponse(),
		});

		await new ModelGate().execute.call(ctx);

		const metadata = sentOptions(httpMock).body.metadata as IDataObject;
		expect(metadata.customer).toBe('acme');
		expect(metadata.source).toBe('n8n');
	});

	it('never injects metadata into the prompt or messages', async () => {
		const { ctx, httpMock } = createExecuteMock({
			items: [{ json: {} }],
			params: {
				inputType: 'prompt',
				model: 'gpt-5',
				prompt: 'Hi',
				simplify: true,
				options: { metadata: { metadataValues: [{ key: 'customer', value: 'acme' }] } },
			},
			httpResponse: okResponse(),
		});

		await new ModelGate().execute.call(ctx);

		const messages = JSON.stringify(sentOptions(httpMock).body.messages);
		expect(messages).not.toContain('acme');
		expect(messages).not.toContain('source');
		expect(messages).not.toContain('workflow_id');
	});
});

describe('ModelGate node — response mapping', () => {
	it('simplifies output while preserving the request id', async () => {
		const { ctx } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: 'gpt-5', prompt: 'Hi', simplify: true, options: {} },
			httpResponse: okResponse('req_simple'),
		});

		const [out] = await new ModelGate().execute.call(ctx);
		expect(out[0].json).toMatchObject({
			text: 'Hello from ModelGate!',
			model: 'gpt-5',
			finish_reason: 'stop',
			usage: { total_tokens: 15 },
			_modelgate: { requestId: 'req_simple' },
		});
	});

	it('preserves the full raw response when simplify is off', async () => {
		const { ctx } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: 'gpt-5', prompt: 'Hi', simplify: false, options: {} },
			httpResponse: okResponse('req_raw'),
		});

		const [out] = await new ModelGate().execute.call(ctx);
		const json = out[0].json as IDataObject;
		expect(json.id).toBe('chatcmpl-abc123');
		expect(json.object).toBe('chat.completion');
		expect(json.choices).toBeDefined();
		expect(json.usage).toBeDefined();
		expect(json._modelgate).toEqual({ requestId: 'req_raw' });
	});

	it('does not leak the API key into the output', async () => {
		const { ctx } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: 'gpt-5', prompt: 'Hi', simplify: false, options: {} },
			credentials: { apiKey: 'mg_supersecret', baseUrl: 'https://gw.modelgatehq.com' },
			httpResponse: okResponse(),
		});

		const [out] = await new ModelGate().execute.call(ctx);
		expect(JSON.stringify(out)).not.toContain('mg_supersecret');
	});
});

describe('ModelGate node — multiple items and linking', () => {
	it('produces one linked output per input item', async () => {
		const items = [{ json: { q: 'a' } }, { json: { q: 'b' } }, { json: { q: 'c' } }];
		const { ctx, httpMock } = createExecuteMock({
			items,
			params: { inputType: 'prompt', model: 'gpt-5', prompt: 'Hi', simplify: true, options: {} },
			httpResponse: okResponse(),
		});

		const [out] = await new ModelGate().execute.call(ctx);
		expect(out).toHaveLength(3);
		expect(httpMock).toHaveBeenCalledTimes(3);
		out.forEach((item, index) => {
			expect(item.pairedItem).toEqual({ item: index });
		});
	});
});

describe('ModelGate node — custom base URL', () => {
	it('respects and normalizes a custom base URL from credentials', async () => {
		const { ctx, httpMock } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: 'gpt-5', prompt: 'Hi', simplify: true, options: {} },
			credentials: { apiKey: 'mg_x', baseUrl: 'http://localhost:8080/' },
			httpResponse: okResponse(),
		});

		await new ModelGate().execute.call(ctx);
		expect(sentOptions(httpMock).url).toBe('http://localhost:8080/v1/chat/completions');
	});
});

describe('ModelGate node — error handling', () => {
	it('throws a NodeApiError on a 401 with a helpful message', async () => {
		const { ctx } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: 'gpt-5', prompt: 'Hi', simplify: true, options: {} },
			httpError: {
				response: {
					statusCode: 401,
					headers: { 'x-modelgate-request-id': 'req_401' },
					body: { error: { message: 'invalid api key' } },
				},
			},
		});

		await expect(new ModelGate().execute.call(ctx)).rejects.toThrow(/401/);
	});

	it('captures errors as data when continueOnFail is set, with request id', async () => {
		const { ctx } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: 'gpt-5', prompt: 'Hi', simplify: true, options: {} },
			continueOnFail: true,
			httpError: {
				response: {
					statusCode: 429,
					headers: { 'x-modelgate-request-id': 'req_429' },
					body: { error: { message: 'rate limited', code: 'rate_limit' } },
				},
			},
		});

		const [out] = await new ModelGate().execute.call(ctx);
		expect(out).toHaveLength(1);
		const json = out[0].json as IDataObject;
		expect(String(json.error)).toContain('429');
		expect((json._modelgate as IDataObject).requestId).toBe('req_429');
		expect((json._modelgate as IDataObject).statusCode).toBe('429');
		expect(out[0].pairedItem).toEqual({ item: 0 });
	});

	it('validates that a prompt is provided', async () => {
		const { ctx } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: 'gpt-5', prompt: '   ', simplify: true, options: {} },
		});

		await expect(new ModelGate().execute.call(ctx)).rejects.toThrow(/prompt/i);
	});

	it('validates that a model is provided', async () => {
		const { ctx } = createExecuteMock({
			items: [{ json: {} }],
			params: { inputType: 'prompt', model: '', prompt: 'Hi', simplify: true, options: {} },
		});

		await expect(new ModelGate().execute.call(ctx)).rejects.toThrow(/model/i);
	});
});
