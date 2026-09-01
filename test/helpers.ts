import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export interface MockContextOptions {
	items: INodeExecutionData[];
	/** Parameter values keyed by name. Supports dotted keys like "messages.message". */
	params: Record<string, unknown>;
	credentials?: Record<string, unknown>;
	continueOnFail?: boolean;
	/** Response returned by httpRequestWithAuthentication, or an error to throw. */
	httpResponse?: unknown;
	httpError?: unknown;
	workflow?: { id?: string | number; name?: string };
	node?: { name?: string; type?: string; typeVersion?: number };
	executionId?: string;
	mode?: string;
}

export interface MockContext {
	ctx: IExecuteFunctions;
	httpMock: jest.Mock;
}

/**
 * Build a minimal but faithful IExecuteFunctions mock for exercising a node's
 * execute() method in isolation.
 */
export function createExecuteMock(options: MockContextOptions): MockContext {
	const {
		items,
		params,
		credentials = { apiKey: 'mg_test_key', baseUrl: 'https://api.modelgatehq.com' },
		continueOnFail = false,
		httpResponse,
		httpError,
		workflow = { id: 'wf_1', name: 'Test Workflow' },
		node = { name: 'ModelGate', type: 'n8n-nodes-modelgate.modelGate', typeVersion: 1 },
		executionId = 'exec_1',
		mode = 'manual',
	} = options;

	const httpMock = jest.fn(async () => {
		if (httpError) {
			throw httpError;
		}
		return httpResponse;
	});

	const getNodeParameter = (name: string, _itemIndex: number, fallback?: unknown) => {
		if (name in params) {
			return params[name];
		}
		return fallback;
	};

	const ctx = {
		getInputData: () => items,
		getNodeParameter: jest.fn(getNodeParameter),
		getCredentials: jest.fn(async () => credentials),
		getWorkflow: () => workflow,
		getNode: () => node,
		getExecutionId: () => executionId,
		getMode: () => mode,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: httpMock,
		},
	} as unknown as IExecuteFunctions;

	return { ctx, httpMock };
}

/** A representative OpenAI-compatible chat completion body. */
export function sampleChatResponse(overrides: Record<string, unknown> = {}) {
	return {
		id: 'chatcmpl-abc123',
		object: 'chat.completion',
		created: 1700000000,
		model: 'gpt-5',
		choices: [
			{
				index: 0,
				finish_reason: 'stop',
				message: { role: 'assistant', content: 'Hello from ModelGate!' },
			},
		],
		usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		...overrides,
	};
}
