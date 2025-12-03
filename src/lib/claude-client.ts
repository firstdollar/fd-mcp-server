import Anthropic from '@anthropic-ai/sdk';
import { tools, type ToolDefinition } from './tools/definitions';

// Lazy initialization of Claude client
let anthropic: Anthropic | null = null;

const getAnthropicClient = (): Anthropic => {
    if (!anthropic) {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.warn('ANTHROPIC_API_KEY not found in environment variables');
        }
        anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || '',
        });
    }
    return anthropic;
};

// Available MCP tools with their descriptions for Claude
const AVAILABLE_TOOLS = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    category: tool.category,
}));

// Interface for Claude's tool selection response
interface ClaudeToolSelection {
    tool: string;
    params: Record<string, unknown>;
    reasoning: string;
    confidence: number;
}

/**
 * Uses Claude to intelligently select the appropriate MCP tool based on user message
 */
export const selectToolWithClaude = async (userMessage: string): Promise<ClaudeToolSelection> => {
    try {
        const systemPrompt = `You are an intelligent tool selector for a First Dollar Partner API MCP Server. Your job is to analyze user messages and select the most appropriate MCP tool to handle their request.

Available MCP Tools:
${AVAILABLE_TOOLS.map((tool) => `- ${tool.name}: ${tool.description} (Category: ${tool.category})`).join('\n')}

Rules:
1. Always select exactly one tool that best matches the user's intent
2. Provide reasoning for your selection
3. Assign a confidence score from 0.1 to 1.0
4. IMPORTANT - Tool Selection Guidelines:
   - Use 'list_organizations' when user wants to LIST multiple organizations or get multiple organization data
   - Use 'get_organization' when user wants to get a SPECIFIC organization by ID
   - Use 'create_organization' when user wants to CREATE, ADD, or ESTABLISH a new organization
   - Use 'list_individuals' when user wants to LIST multiple individuals or get multiple individual data
   - Use 'get_individual' when user wants to get a SPECIFIC individual by ID
   - Use 'create_individual' when user wants to CREATE, ADD, or ESTABLISH a new individual (person, employee, member, user)
   - Use 'update_individual' when user wants to UPDATE, EDIT, MODIFY, or CHANGE information for an existing individual
   - Use 'verify_individual' when user wants to VERIFY an individual through KYC (Know Your Customer) checks
   - Use 'list_benefits_programs' when user wants to LIST multiple benefits programs
   - Use 'get_benefits_program' when user wants to get a SPECIFIC benefits program by ID
   - Use 'get_benefit' when user wants to get a SPECIFIC benefit by ID
   - Use 'enroll_individual_in_benefit' when user wants to ENROLL, SIGN UP, or REGISTER an individual in a benefit program
   - Use 'ping' when user wants to test the API connection

5. Extract parameters from the user's message when possible:
   - For create_organization: {"name": "Organization Name"}
   - For create_individual: {"firstName": "John", "lastName": "Doe", "email": "john@example.com", ...}
   - For update_individual: {"id": "individual_123", "firstName": "John", ...}
   - For verify_individual: {"individualId": "individual_123"}
   - For enroll_individual_in_benefit: {"benefitId": "benefit_123", "individualId": "individual_456"}
   - For get_* queries: {"id": "the_id"}
   - For list_* queries: {} or with filters like {"organizationIds": ["id1", "id2"]}

Respond with a JSON object in this exact format:
{
    "tool": "tool_name",
    "params": {},
    "reasoning": "Brief explanation of why this tool was selected",
    "confidence": 0.95
}`;

        const response = await getAnthropicClient().messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: `User message: "${userMessage}"\n\nSelect the best MCP tool to handle this request.`,
                },
            ],
        });

        const content = response.content[0];
        if (content.type !== 'text') {
            throw new Error('Unexpected response type from Claude');
        }

        // Parse Claude's JSON response
        let selection: ClaudeToolSelection;
        try {
            // Try to extract JSON from the response (in case Claude adds extra text)
            const jsonMatch = content.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                selection = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('JSON parsing failed. Claude response was:', content.text);
            throw new Error(`Failed to parse Claude's JSON response: ${parseError}`);
        }

        // Validate the selected tool exists
        const toolExists = AVAILABLE_TOOLS.some((tool) => tool.name === selection.tool);
        if (!toolExists) {
            console.warn(`Claude selected unknown tool: ${selection.tool}. Falling back to ping.`);
            return {
                tool: 'ping',
                params: {},
                reasoning: `Fallback: Unknown tool "${selection.tool}" was selected`,
                confidence: 0.5,
            };
        }

        console.log(`Claude selected tool: ${selection.tool} (confidence: ${selection.confidence})`);
        console.log(`Reasoning: ${selection.reasoning}`);

        return selection;
    } catch (error) {
        console.error('Claude API error:', error);

        // Fallback to simple keyword matching if Claude fails
        const lowerMessage = userMessage.toLowerCase().trim();

        if (lowerMessage.includes('ping') || lowerMessage.includes('test') || lowerMessage.includes('connection')) {
            return {
                tool: 'ping',
                params: {},
                reasoning: 'Fallback: Detected connection test keywords',
                confidence: 0.6,
            };
        }

        if (
            lowerMessage.includes('organization') &&
            (lowerMessage.includes('create') || lowerMessage.includes('add') || lowerMessage.includes('new'))
        ) {
            return {
                tool: 'create_organization',
                params: {},
                reasoning: 'Fallback: Detected organization creation keywords',
                confidence: 0.6,
            };
        }

        if (lowerMessage.includes('organization') && (lowerMessage.includes('list') || lowerMessage.includes('all'))) {
            return {
                tool: 'list_organizations',
                params: {},
                reasoning: 'Fallback: Detected organization list keywords',
                confidence: 0.6,
            };
        }

        if (
            lowerMessage.includes('individual') &&
            (lowerMessage.includes('create') || lowerMessage.includes('add') || lowerMessage.includes('new'))
        ) {
            return {
                tool: 'create_individual',
                params: {},
                reasoning: 'Fallback: Detected individual creation keywords',
                confidence: 0.6,
            };
        }

        if (lowerMessage.includes('individual') && (lowerMessage.includes('list') || lowerMessage.includes('all'))) {
            return {
                tool: 'list_individuals',
                params: {},
                reasoning: 'Fallback: Detected individual list keywords',
                confidence: 0.6,
            };
        }

        if (lowerMessage.includes('benefit') && (lowerMessage.includes('enroll') || lowerMessage.includes('sign up'))) {
            return {
                tool: 'enroll_individual_in_benefit',
                params: {},
                reasoning: 'Fallback: Detected enrollment keywords',
                confidence: 0.6,
            };
        }

        if (lowerMessage.includes('benefit') && (lowerMessage.includes('list') || lowerMessage.includes('program'))) {
            return {
                tool: 'list_benefits_programs',
                params: {},
                reasoning: 'Fallback: Detected benefits programs list keywords',
                confidence: 0.6,
            };
        }

        // Default fallback to ping
        return {
            tool: 'ping',
            params: {},
            reasoning: 'Fallback: Claude API unavailable, testing connection',
            confidence: 0.4,
        };
    }
};

/**
 * Uses Claude to generate a conversational response based on MCP tool results
 */
export const generateResponseWithClaude = async (
    userMessage: string,
    toolName: string,
    toolResult: unknown,
    reasoning: string,
): Promise<string> => {
    try {
        const systemPrompt = `You are a helpful assistant for the First Dollar Partner API MCP Server. You help users by interpreting results from MCP tools and providing clear, helpful responses.

Context:
- User asked: "${userMessage}"
- I used the "${toolName}" tool to help them
- Tool selection reasoning: ${reasoning}

Your job:
- Interpret the tool results and explain them clearly to the user
- Format data in markdown tables when appropriate for better readability
- Include relevant IDs and important fields
- When showing response statuses, use bold text and emojis (success, error)
- Be concise but informative
- If there was an error, explain what went wrong and suggest next steps

Format your response in markdown for better readability.`;

        const response = await getAnthropicClient().messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: `Tool result from ${toolName}:\n\n${JSON.stringify(toolResult, null, 2)}\n\nPlease provide a helpful response to the user.`,
                },
            ],
        });

        const content = response.content[0];
        if (content.type !== 'text') {
            throw new Error('Unexpected response type from Claude');
        }

        return content.text;
    } catch (error) {
        console.error('Claude response generation error:', error);

        // Fallback: Format the result ourselves
        try {
            const result = toolResult as { success?: boolean; error?: string; data?: unknown };
            if (result.success) {
                return `**Success**\n\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``;
            } else if (result.error) {
                return `**Error**\n\n${result.error}`;
            } else {
                return `## Response from ${toolName}\n\n\`\`\`json\n${JSON.stringify(toolResult, null, 2)}\n\`\`\``;
            }
        } catch {
            return `I executed the ${toolName} tool, but encountered an error formatting the response.`;
        }
    }
};

export default getAnthropicClient;
