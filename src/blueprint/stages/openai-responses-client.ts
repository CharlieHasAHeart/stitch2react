import OpenAI from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { stageMaxOutputTokens, stageReasoningEffort } from "../prompts/stages.js";
import { readOpenAIEnv } from "../shared/env.js";
import type { BlueprintStage } from "../types/blueprint.js";

export type ResponsesStageRequest = {
  model: string;
  stage: BlueprintStage;
  stageRunId: string;
  sessionId: string;
  promptVersion: string;
  instructions: string;
  payload: unknown;
  schema: z.ZodTypeAny;
  schemaName: string;
};

export type ResponsesStageResult = {
  output: unknown;
  openaiResponseId?: string;
};

export interface BlueprintStageClient {
  runStage(request: ResponsesStageRequest): Promise<ResponsesStageResult>;
}

type JsonSchemaValue =
  | string
  | number
  | boolean
  | null
  | JsonSchemaObject
  | JsonSchemaValue[];

type JsonSchemaObject = {
  [key: string]: JsonSchemaValue;
};

function extractJsonText(response: OpenAI.Responses.Response): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  for (const item of response.output ?? []) {
    if (!("content" in item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        return content.text;
      }
    }
  }

  throw new Error("OpenAI response did not include structured output text.");
}

function shouldOmitTemperature(model: string): boolean {
  return /^gpt-5([.-]|$)/i.test(model);
}

function isObject(value: unknown): value is JsonSchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneSchema<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getByPointer(root: JsonSchemaObject, ref: string): JsonSchemaObject {
  const path = ref.replace(/^#\//, "").split("/");
  let current: unknown = root;

  for (const segment of path) {
    if (!isObject(current) || !(segment in current)) {
      throw new Error(`Unresolvable JSON schema reference: ${ref}`);
    }
    current = current[segment];
  }

  if (!isObject(current)) {
    throw new Error(`Referenced JSON schema node is not an object: ${ref}`);
  }

  return current;
}

function inlineRefs(node: JsonSchemaValue, root: JsonSchemaObject): JsonSchemaValue {
  if (Array.isArray(node)) {
    return node.map((item) => inlineRefs(item, root));
  }

  if (!isObject(node)) {
    return node;
  }

  if (typeof node.$ref === "string" && node.$ref.startsWith("#/")) {
    const target = cloneSchema(getByPointer(root, node.$ref));
    const { $ref: _ref, ...rest } = node;
    return inlineRefs({ ...target, ...rest }, root);
  }

  const result: JsonSchemaObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$schema" || key === "definitions") {
      continue;
    }
    result[key] = inlineRefs(value, root);
  }
  return result;
}

function allowNull(schema: JsonSchemaValue): JsonSchemaValue {
  if (Array.isArray(schema)) {
    return schema.includes("null") ? schema : [...schema, "null"];
  }

  if (!isObject(schema)) {
    return schema;
  }

  if (typeof schema.type === "string") {
    return {
      ...schema,
      type: [schema.type, "null"]
    };
  }

  if (Array.isArray(schema.type)) {
    return {
      ...schema,
      type: schema.type.includes("null") ? schema.type : [...schema.type, "null"]
    };
  }

  return {
    ...schema,
    anyOf: [schema, { type: "null" }]
  };
}

function normalizeForStrictObjects(node: JsonSchemaValue): JsonSchemaValue {
  if (Array.isArray(node)) {
    return node.map(normalizeForStrictObjects);
  }

  if (!isObject(node)) {
    return node;
  }

  const normalizedEntries = Object.entries(node).map(([key, value]) => [
    key,
    normalizeForStrictObjects(value)
  ] as const);
  const result: JsonSchemaObject = Object.fromEntries(normalizedEntries);

  if (isObject(result.properties)) {
    const properties = result.properties as Record<string, JsonSchemaValue>;
    const propertyKeys = Object.keys(properties);
    const required = Array.isArray(result.required)
      ? result.required.filter((value): value is string => typeof value === "string")
      : [];
    const requiredSet = new Set(required);

    for (const key of propertyKeys) {
      if (!requiredSet.has(key)) {
        properties[key] = allowNull(properties[key]);
      }
    }

    result.properties = properties;
    result.required = propertyKeys;
    result.additionalProperties = false;
  }

  return result;
}

function stripNullOptionals(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripNullOptionals);
  }

  if (node && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (value === null) {
        continue;
      }
      result[key] = stripNullOptionals(value);
    }
    return result;
  }

  return node;
}

function toProviderJsonSchema(schema: z.ZodTypeAny, schemaName: string): JsonSchemaObject {
  const rawSchema = zodToJsonSchema(schema, schemaName) as JsonSchemaObject;
  const definitions = isObject(rawSchema.definitions)
    ? (rawSchema.definitions as Record<string, JsonSchemaObject>)
    : {};
  const rootObject = definitions[schemaName] ?? rawSchema;
  const dereferenced = inlineRefs(cloneSchema(rootObject), rawSchema);
  const normalized = normalizeForStrictObjects(dereferenced);

  if (isObject(normalized) && normalized.type === "object") {
    return normalized;
  }

  throw new Error(
    `Generated JSON schema for ${schemaName} is not a provider-compatible root object schema.`
  );
}

export class OpenAIResponsesStageClient implements BlueprintStageClient {
  private readonly client: OpenAI;

  constructor(client?: OpenAI) {
    if (client) {
      this.client = client;
      return;
    }

    const env = readOpenAIEnv();
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL
    });
  }

  async runStage(request: ResponsesStageRequest): Promise<ResponsesStageResult> {
    const response = await this.client.responses.create({
      model: request.model,
      instructions: request.instructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(request.payload)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: request.schemaName,
          strict: true,
          schema: toProviderJsonSchema(request.schema, request.schemaName)
        }
      },
      reasoning: {
        effort: stageReasoningEffort[request.stage]
      },
      ...(shouldOmitTemperature(request.model) ? {} : { temperature: 0.2 }),
      max_output_tokens: stageMaxOutputTokens[request.stage],
      store: false,
      metadata: {
        sessionId: request.sessionId,
        stageRunId: request.stageRunId,
        stage: request.stage,
        promptVersion: request.promptVersion
      }
    });

    return {
      output: stripNullOptionals(JSON.parse(extractJsonText(response))),
      openaiResponseId: response.id
    };
  }
}
