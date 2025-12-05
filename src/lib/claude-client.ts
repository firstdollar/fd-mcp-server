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
        const systemPrompt = `You are an intelligent tool selector for a First Dollar Health Wallet Manager API. Your job is to analyze user messages and select the most appropriate tool to handle their request.

Available Tools:
${AVAILABLE_TOOLS.map((tool) => `- ${tool.name}: ${tool.description} (Category: ${tool.category})`).join('\n')}

Rules:
1. Always select exactly one tool that best matches the user's intent
2. Provide reasoning for your selection
3. Assign a confidence score from 0.1 to 1.0
4. IMPORTANT - Tool Selection Guidelines:
   - Use 'list_organizations' when user wants to LIST multiple organizations or see all organizations
   - Use 'get_organization' when user wants to get a SPECIFIC organization by short code
   - Use 'list_organization_members' when user wants to see members of a specific organization
   - Use 'list_users' when user wants to LIST multiple users/members/employees/individuals
   - Use 'get_user_details' when user wants detailed information about a SPECIFIC user by UID
   - Use 'bulk_create_individuals' when user wants to CREATE new individuals/members in an organization
   - Use 'list_benefits_programs' when user wants to LIST benefits programs for an organization
   - Use 'list_offering_templates' when user wants to see available offering templates for a partner
   - Use 'create_or_return_root_benefits_program' when user wants to CREATE a benefits program for an organization
   - Use 'create_benefits_offering' when user wants to CREATE a new benefits offering within a program
   - Use 'bulk_enroll_in_offerings' when user wants to ENROLL individuals in benefit offerings
   - Use 'unenroll_participant_from_offerings' when user wants to UNENROLL/REMOVE a participant from offerings
   - Use 'list_claims' when user wants to see claims for reimbursement
   - Use 'get_current_partner' when user wants to know about their current partner context
   - Use 'get_current_administrator' when user wants to know about their logged-in administrator account

5. Extract parameters from the user's message when possible:
   - For get_organization: {"organizationCode": "ACME"}
   - For list_organization_members: {"organizationCode": "ACME", "memberName": "John"}
   - For list_users: {"organizationCodes": ["ACME"], "name": "John"}
   - For get_user_details: {"uid": "user_123"}
   - For bulk_create_individuals: {"organizationUlid": "org_ulid", "individuals": [{"email": "john@example.com", "name": {"firstName": "John", "lastName": "Doe"}}]}
   - For list_benefits_programs: {"organizationCode": "ACME"}
   - For list_offering_templates: {"partnerCode": "PARTNER"}
   - For create_or_return_root_benefits_program: {"organizationCode": "ACME"}
   - For create_benefits_offering: {"benefitsProgramId": "prog_id", "templateId": "tmpl_id", "name": "HSA Benefit", "description": "Health Savings Account", "startDate": "2025-01-01"}
   - For bulk_enroll_in_offerings: {"enrollments": [{"externalUserId": "emp_123", "offeringId": "off_id"}]}
   - For unenroll_participant_from_offerings: {"participantUid": "user_uid", "offeringIds": ["off_id"]}
   - For list_claims: {"organizationCodes": ["ACME"], "statuses": ["PENDING"]}
   - For list_organizations: {} (optional: organizationName, organizationCode filter)

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
                    content: `User message: "${userMessage}"\n\nSelect the best tool to handle this request.`,
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
            console.warn(`Claude selected unknown tool: ${selection.tool}. Falling back to get_current_administrator.`);
            return {
                tool: 'get_current_administrator',
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

        // Organizations
        if (lowerMessage.includes('organization') && (lowerMessage.includes('list') || lowerMessage.includes('all'))) {
            return {
                tool: 'list_organizations',
                params: {},
                reasoning: 'Fallback: Detected organization list keywords',
                confidence: 0.6,
            };
        }

        if (lowerMessage.includes('organization') && lowerMessage.includes('member')) {
            return {
                tool: 'list_organization_members',
                params: {},
                reasoning: 'Fallback: Detected organization members keywords',
                confidence: 0.6,
            };
        }

        // Users
        if (
            (lowerMessage.includes('user') ||
                lowerMessage.includes('member') ||
                lowerMessage.includes('employee') ||
                lowerMessage.includes('individual')) &&
            (lowerMessage.includes('list') || lowerMessage.includes('all'))
        ) {
            return {
                tool: 'list_users',
                params: {},
                reasoning: 'Fallback: Detected user list keywords',
                confidence: 0.6,
            };
        }

        // Benefits
        if (
            (lowerMessage.includes('benefit') || lowerMessage.includes('program')) &&
            (lowerMessage.includes('list') || lowerMessage.includes('all'))
        ) {
            return {
                tool: 'list_benefits_programs',
                params: {},
                reasoning: 'Fallback: Detected benefits programs list keywords',
                confidence: 0.6,
            };
        }

        // Create benefits program
        if (
            (lowerMessage.includes('benefit') || lowerMessage.includes('program')) &&
            lowerMessage.includes('create')
        ) {
            return {
                tool: 'create_or_return_root_benefits_program',
                params: {},
                reasoning: 'Fallback: Detected create benefits program keywords',
                confidence: 0.6,
            };
        }

        // Create benefits offering
        if (lowerMessage.includes('offering') && lowerMessage.includes('create')) {
            return {
                tool: 'create_benefits_offering',
                params: {},
                reasoning: 'Fallback: Detected create offering keywords',
                confidence: 0.6,
            };
        }

        // Enrollments
        if (lowerMessage.includes('enroll') && !lowerMessage.includes('unenroll')) {
            return {
                tool: 'bulk_enroll_in_offerings',
                params: {},
                reasoning: 'Fallback: Detected enrollment keywords',
                confidence: 0.6,
            };
        }

        if (lowerMessage.includes('unenroll') || (lowerMessage.includes('remove') && lowerMessage.includes('offering'))) {
            return {
                tool: 'unenroll_participant_from_offerings',
                params: {},
                reasoning: 'Fallback: Detected unenrollment keywords',
                confidence: 0.6,
            };
        }

        // Create individuals
        if (
            (lowerMessage.includes('user') ||
                lowerMessage.includes('member') ||
                lowerMessage.includes('employee') ||
                lowerMessage.includes('individual')) &&
            lowerMessage.includes('create')
        ) {
            return {
                tool: 'bulk_create_individuals',
                params: {},
                reasoning: 'Fallback: Detected create individual keywords',
                confidence: 0.6,
            };
        }

        // Claims
        if (lowerMessage.includes('claim') && (lowerMessage.includes('list') || lowerMessage.includes('all'))) {
            return {
                tool: 'list_claims',
                params: {},
                reasoning: 'Fallback: Detected claims list keywords',
                confidence: 0.6,
            };
        }

        // Partner/Administrator
        if (lowerMessage.includes('partner') && lowerMessage.includes('current')) {
            return {
                tool: 'get_current_partner',
                params: {},
                reasoning: 'Fallback: Detected current partner keywords',
                confidence: 0.6,
            };
        }

        if (
            (lowerMessage.includes('admin') || lowerMessage.includes('me') || lowerMessage.includes('who am i')) &&
            (lowerMessage.includes('current') || lowerMessage.includes('logged'))
        ) {
            return {
                tool: 'get_current_administrator',
                params: {},
                reasoning: 'Fallback: Detected current administrator keywords',
                confidence: 0.6,
            };
        }

        // Default fallback to get_current_administrator
        return {
            tool: 'get_current_administrator',
            params: {},
            reasoning: 'Fallback: Claude API unavailable, showing current administrator info',
            confidence: 0.4,
        };
    }
};

/**
 * Uses Claude to generate a conversational response based on tool results
 */
export const generateResponseWithClaude = async (
    userMessage: string,
    toolName: string,
    toolResult: unknown,
    reasoning: string,
): Promise<string> => {
    try {
        const systemPrompt = `You are a helpful assistant for the First Dollar Health Wallet Manager. You help users by interpreting results from API tools and providing clear, helpful responses.

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
