#!/usr/bin/env node
/**
 * Claude Worker - Anthropic API adapter for AgentRed Worker Protocol
 *
 * Usage: node claude-worker.js '<JSON_ENVELOPE>'
 * Environment: ANTHROPIC_API_KEY must be set
 */

// Lazy-import Anthropic SDK at runtime — installed separately by the operator: npm install @anthropic-ai/sdk
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnthropicClient = any;

interface WorkerProtocolEnvelope {
  protocolVersion: string;
  role: string;
  contract: {
    objective: string;
    hardRules: string[];
    toolUse: string[];
    output: string[];
  };
  task: unknown;
  toolSurface: unknown;
  domainSkills: unknown[];
  credentialReferences: unknown[];
  pocTemplates: unknown[];
  toolboxBundles: unknown[];
  connectors: unknown[];
  strategyHints: string[];
  strategyRecommendations: unknown[];
  outputSchema: unknown;
  examples: unknown[];
}

async function main() {
  if (process.argv.length < 3) {
    console.error(JSON.stringify({ accepted: false, reason: 'No worker protocol envelope provided' }));
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({ accepted: false, reason: 'ANTHROPIC_API_KEY environment variable is not set' }));
    process.exit(1);
  }

  let envelope: WorkerProtocolEnvelope;
  try {
    envelope = JSON.parse(process.argv[2]);
  } catch (error) {
    console.error(JSON.stringify({ accepted: false, reason: 'Invalid JSON envelope' }));
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { default: Anthropic } = await import('@anthropic-ai/sdk' as string) as { default: new (opts: { apiKey: string }) => AnthropicClient };
  const client: AnthropicClient = new Anthropic({ apiKey });

  const systemPrompt = `You are an AgentRed security assessment worker operating under the ${envelope.protocolVersion} protocol.

Your role is: ${envelope.role}

OBJECTIVE:
${envelope.contract.objective}

HARD RULES (you must follow these strictly):
${envelope.contract.hardRules.map((r) => `- ${r}`).join('\n')}

TOOL USE RULES:
${envelope.contract.toolUse.map((r) => `- ${r}`).join('\n')}

OUTPUT RULES:
${envelope.contract.output.map((r) => `- ${r}`).join('\n')}

STRATEGY HINTS:
${envelope.strategyHints.slice(0, 10).map((h) => `- ${h}`).join('\n')}

You must return ONLY valid JSON matching the output schema. No markdown blocks, no explanations, no preamble.`;

  const userContent = JSON.stringify({
    task: envelope.task,
    toolSurface: envelope.toolSurface,
    domainSkills: envelope.domainSkills,
    pocTemplates: envelope.pocTemplates,
    toolboxBundles: envelope.toolboxBundles,
    connectors: envelope.connectors,
    strategyRecommendations: envelope.strategyRecommendations,
    outputSchema: envelope.outputSchema,
    examples: envelope.examples,
  }, null, 2);

  try {
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    const textContent = (response.content as Array<{ type: string; text?: string }>).find((c) => c.type === 'text');
    if (!textContent || !textContent.text) {
      console.error(JSON.stringify({ accepted: false, reason: 'Claude returned no text content' }));
      process.exit(1);
    }

    const cleanJson = extractJsonResponse((textContent.text as string).trim());
    const parsed = JSON.parse(cleanJson) as { accepted?: unknown; data?: unknown; reason?: unknown };
    if (parsed.accepted !== true && parsed.accepted !== false) {
      throw new Error('Claude response did not include accepted=true/false');
    }
    if (parsed.accepted === true && (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data))) {
      throw new Error('Claude accepted response did not include a data object');
    }
    if (parsed.accepted === false && typeof parsed.reason !== 'string') {
      throw new Error('Claude rejection response did not include a reason string');
    }

    console.log(cleanJson);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ accepted: false, reason: `Claude worker error: ${redactError(errorMessage)}` }));
    process.exit(1);
  }
}

function extractJsonResponse(text: string): string {
  try {
    JSON.parse(text);
    return text;
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      JSON.parse(fenced[1]);
      return fenced[1];
    }
    throw new Error('Claude returned non-JSON output');
  }
}

function redactError(message: string): string {
  return message.replace(/(api[_-]?key|authorization|token|secret|password)\s*[:=]\s*\S+/gi, '$1=[redacted]');
}

main().catch((error) => {
  console.error(JSON.stringify({ accepted: false, reason: error instanceof Error ? redactError(error.message) : redactError(String(error)) }));
  process.exit(1);
});
