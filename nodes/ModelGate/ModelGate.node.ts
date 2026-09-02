import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	buildChatCompletionsUrl,
	buildMessagesFromPrompt,
	buildMetadata,
	extractRequestId,
	extractText,
	normalizeMessages,
	parseModelGateError,
	type ChatMessage,
	type ChatResponseBody,
	type MetadataContext,
	type UserMetadataEntry,
} from './GenericFunctions';

/** Collect best-effort n8n execution context for ModelGate attribution. */
function gatherContext(ctx: IExecuteFunctions): MetadataContext {
	const context: MetadataContext = {};
	try {
		const workflow = ctx.getWorkflow();
		if (workflow?.id !== undefined) {
			context.workflowId = String(workflow.id);
		}
		context.workflowName = workflow?.name;
	} catch {
		// best-effort only
	}
	try {
		context.executionId = ctx.getExecutionId();
	} catch {
		// best-effort only
	}
	try {
		context.executionMode = ctx.getMode();
	} catch {
		// best-effort only
	}
	try {
		const node = ctx.getNode();
		context.nodeName = node?.name;
		context.nodeType = node?.type;
		context.nodeTypeVersion = node?.typeVersion;
	} catch {
		// best-effort only
	}
	return context;
}

export class ModelGate implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ModelGate',
		name: 'modelGate',
		icon: { light: 'file:modelgate.svg', dark: 'file:modelgate.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{"Model: " + $parameter["model"]}}',
		description: 'Call an LLM through the ModelGate gateway',
		defaults: {
			name: 'ModelGate',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'modelGateApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Input Mode',
				name: 'inputType',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Simple Prompt',
						value: 'prompt',
						description: 'Send a single prompt as a user message',
					},
					{
						name: 'Define Messages',
						value: 'messages',
						description: 'Build a full chat conversation with system/user/assistant roles',
					},
				],
				default: 'prompt',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: 'gpt-5',
				required: true,
				placeholder: 'e.g. gpt-5, claude-sonnet-5, gemini-2.5-pro',
				description:
					'The model to route the request to. Any model supported by your ModelGate account can be used.',
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				displayOptions: { show: { inputType: ['prompt'] } },
				description: 'The prompt to send to the model as a single user message',
			},
			{
				displayName: 'System Prompt',
				name: 'systemPrompt',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				displayOptions: { show: { inputType: ['prompt'] } },
				description: 'Optional system instructions prepended before the prompt',
			},
			{
				displayName: 'Messages',
				name: 'messages',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true, sortable: true },
				default: {},
				placeholder: 'Add Message',
				displayOptions: { show: { inputType: ['messages'] } },
				description: 'The chat messages to send to the model',
				options: [
					{
						name: 'message',
						displayName: 'Message',
						values: [
							{
								displayName: 'Role',
								name: 'role',
								type: 'options',
								options: [
									{ name: 'System', value: 'system' },
									{ name: 'User', value: 'user' },
									{ name: 'Assistant', value: 'assistant' },
								],
								default: 'user',
							},
							{
								displayName: 'Content',
								name: 'content',
								type: 'string',
								typeOptions: { rows: 3 },
								default: '',
								description: 'The text content of the message',
							},
						],
					},
				],
			},
			{
				displayName: 'Simplify Output',
				name: 'simplify',
				type: 'boolean',
				default: true,
				description:
					'Whether to return a compact result (text, model, usage) instead of the full raw ModelGate response',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						type: 'number',
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 2 },
						default: 0,
						description: 'Penalise new tokens based on their existing frequency so far',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1024,
						description: 'The maximum number of tokens to generate in the completion',
					},
					{
						displayName: 'Metadata',
						name: 'metadata',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						default: {},
						placeholder: 'Add Metadata',
						description:
							'Extra metadata to attach to the ModelGate request. Reserved n8n attribution keys cannot be overwritten.',
						options: [
							{
								name: 'metadataValues',
								displayName: 'Metadata',
								values: [
									{
										displayName: 'Key',
										name: 'key',
										type: 'string',
										default: '',
									},
									{
										displayName: 'Value',
										name: 'value',
										type: 'string',
										default: '',
									},
								],
							},
						],
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						type: 'number',
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 2 },
						default: 0,
						description: 'Penalise new tokens based on whether they appear in the text so far',
					},
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						type: 'options',
						options: [
							{ name: 'Text', value: 'text' },
							{ name: 'JSON Object', value: 'json_object' },
						],
						default: 'text',
						description:
							'Set to JSON Object to request a valid-JSON response (the model must be instructed to produce JSON)',
					},
					{
						displayName: 'Temperature',
						name: 'temperature',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 2 },
						default: 0.7,
						description: 'Controls randomness. Lower is more deterministic, higher is more creative.',
					},
					{
						displayName: 'Timeout (Ms)',
						name: 'timeout',
						type: 'number',
						typeOptions: { minValue: 1000 },
						default: 60000,
						description: 'How long to wait for a ModelGate response before failing',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
						default: 1,
						description: 'Nucleus sampling: consider only tokens within the top P probability mass',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const context = gatherContext(this);

		for (let i = 0; i < items.length; i++) {
			try {
				const inputType = this.getNodeParameter('inputType', i) as string;
				const model = (this.getNodeParameter('model', i) as string)?.trim();
				const simplify = this.getNodeParameter('simplify', i, true) as boolean;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;

				if (!model) {
					throw new NodeOperationError(this.getNode(), 'A model must be provided', {
						itemIndex: i,
					});
				}

				let messages: ChatMessage[];
				if (inputType === 'messages') {
					const raw = this.getNodeParameter('messages.message', i, []) as Array<{
						role?: string;
						content?: string;
					}>;
					messages = normalizeMessages(raw);
					if (messages.length === 0) {
						throw new NodeOperationError(
							this.getNode(),
							'At least one message with content is required',
							{ itemIndex: i },
						);
					}
				} else {
					const prompt = this.getNodeParameter('prompt', i) as string;
					const systemPrompt = this.getNodeParameter('systemPrompt', i, '') as string;
					if (!prompt || prompt.trim() === '') {
						throw new NodeOperationError(this.getNode(), 'A prompt must be provided', {
							itemIndex: i,
						});
					}
					messages = buildMessagesFromPrompt(prompt, systemPrompt);
				}

				const metadataOption = (options.metadata as IDataObject | undefined) ?? {};
				const userMetadata =
					(metadataOption.metadataValues as UserMetadataEntry[] | undefined) ?? [];
				const metadata = buildMetadata(context, userMetadata);

				const body: IDataObject = {
					model,
					messages,
					stream: false,
					metadata,
				};

				if (options.temperature !== undefined) {
					body.temperature = options.temperature;
				}
				if (options.maxTokens !== undefined) {
					body.max_tokens = options.maxTokens;
				}
				if (options.topP !== undefined) {
					body.top_p = options.topP;
				}
				if (options.frequencyPenalty !== undefined) {
					body.frequency_penalty = options.frequencyPenalty;
				}
				if (options.presencePenalty !== undefined) {
					body.presence_penalty = options.presencePenalty;
				}
				if (options.responseFormat && options.responseFormat !== 'text') {
					body.response_format = { type: options.responseFormat };
				}

				const timeout = (options.timeout as number | undefined) ?? 60000;

				const credentials = await this.getCredentials('modelGateApi', i);
				const url = buildChatCompletionsUrl(credentials.baseUrl as string);

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'modelGateApi',
					{
						method: 'POST',
						url,
						body,
						json: true,
						returnFullResponse: true,
						timeout,
					},
				)) as { body: ChatResponseBody; headers: Record<string, unknown> };

				const requestId = extractRequestId(response.headers);
				const responseBody = response.body ?? {};

				let json: IDataObject;
				if (simplify) {
					json = {
						text: extractText(responseBody),
						model: responseBody.model,
						finish_reason: responseBody.choices?.[0]?.finish_reason,
						usage: responseBody.usage,
						_modelgate: { requestId },
					};
				} else {
					json = { ...(responseBody as IDataObject), _modelgate: { requestId } };
				}

				returnData.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					const parsed = parseModelGateError(error);
					returnData.push({
						json: {
							error: parsed.message,
							description: parsed.description,
							_modelgate: {
								requestId: parsed.requestId,
								statusCode: parsed.httpCode,
								code: parsed.errorCode,
							},
						},
						pairedItem: { item: i },
					});
					continue;
				}

				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error.message, { itemIndex: i });
				}

				const parsed = parseModelGateError(error);
				throw new NodeApiError(this.getNode(), error as JsonObject, {
					message: parsed.message,
					description: parsed.description,
					httpCode: parsed.httpCode,
					itemIndex: i,
				});
			}
		}

		return [returnData];
	}
}
