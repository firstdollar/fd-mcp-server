/**
 * MCP Tool Registration
 *
 * Registers Partner API tools with the MCP server using the official SDK.
 * Tools are defined in ../lib/tools/definitions.ts and registered using Zod schemas.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tools, type ToolDefinition } from '../lib/tools/definitions.js';

const PARTNER_API_URL = process.env.PARTNER_API_URL || 'https://api.dev.firstdollar.com';

/**
 * Execute a GraphQL query against the Partner API
 */
async function executeGraphQL(
    token: string,
    query: string,
    variables: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string }> }> {
    const response = await fetch(`${PARTNER_API_URL}/graphql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, variables }),
    });

    return response.json() as Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string }> }>;
}

/**
 * Transform flat tool arguments into nested GraphQL input structure
 *
 * Some tools (like createIndividual, updateIndividual) have flat input schemas
 * but need nested structures for GraphQL mutations.
 */
function transformArguments(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    // Mutations that need `input` wrapper
    const mutationsNeedingInputWrapper = [
        'create_organization',
        'create_individual',
        'update_individual',
        'verify_individual',
        'enroll_individual_in_benefit',
    ];

    if (!mutationsNeedingInputWrapper.includes(toolName)) {
        return args;
    }

    // Special handling for different mutations
    switch (toolName) {
        case 'create_organization':
            return { input: { name: args.name } };

        case 'create_individual': {
            const input: Record<string, unknown> = {
                name: {
                    firstName: args.firstName,
                    lastName: args.lastName,
                    ...(args.middleName ? { middleName: args.middleName } : {}),
                },
            };

            if (args.email) {
                input.email = args.email;
            }
            if (args.phoneNumber) {
                input.phoneNumber = args.phoneNumber;
            }
            if (args.dateOfBirth) {
                input.dateOfBirth = args.dateOfBirth;
            }
            if (args.tin) {
                input.tin = args.tin;
            }
            if (args.language) {
                input.language = args.language;
            }
            if (args.externalUserId) {
                input.externalUserId = args.externalUserId;
            }

            // Address fields
            if (args.addressLine1 || args.city || args.state || args.zip) {
                input.address = {
                    addressLine1: args.addressLine1,
                    ...(args.addressLine2 ? { addressLine2: args.addressLine2 } : {}),
                    city: args.city,
                    state: args.state,
                    zip: args.zip,
                    country: args.country || 'US',
                };
            }

            return { input };
        }

        case 'update_individual': {
            const input: Record<string, unknown> = { id: args.id };

            // Name fields
            if (args.firstName || args.lastName || args.middleName) {
                input.name = {
                    ...(args.firstName ? { firstName: args.firstName } : {}),
                    ...(args.lastName ? { lastName: args.lastName } : {}),
                    ...(args.middleName ? { middleName: args.middleName } : {}),
                };
            }

            if (args.email) {
                input.email = args.email;
            }
            if (args.phoneNumber) {
                input.phoneNumber = args.phoneNumber;
            }
            if (args.dateOfBirth) {
                input.dateOfBirth = args.dateOfBirth;
            }
            if (args.tin) {
                input.tin = args.tin;
            }
            if (args.language) {
                input.language = args.language;
            }

            // Address fields
            if (args.addressLine1 || args.city || args.state || args.zip) {
                input.address = {
                    ...(args.addressLine1 ? { addressLine1: args.addressLine1 } : {}),
                    ...(args.addressLine2 ? { addressLine2: args.addressLine2 } : {}),
                    ...(args.city ? { city: args.city } : {}),
                    ...(args.state ? { state: args.state } : {}),
                    ...(args.zip ? { zip: args.zip } : {}),
                    ...(args.country ? { country: args.country } : {}),
                };
            }

            return { input };
        }

        case 'verify_individual':
            return {
                input: {
                    individualId: args.individualId,
                    ...(args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
                },
            };

        case 'enroll_individual_in_benefit': {
            const input: Record<string, unknown> = {
                benefitId: args.benefitId,
                individualId: args.individualId,
            };

            if (args.verificationId) {
                input.verificationId = args.verificationId;
            }
            if (args.startDate) {
                input.startDate = args.startDate;
            }
            if (args.endDate) {
                input.endDate = args.endDate;
            }

            // Convert dollar amounts to cents for GraphQL
            if (args.employeeInitialContributionAmount !== undefined) {
                input.employeeInitialContributionAmount = {
                    amount: Math.round((args.employeeInitialContributionAmount as number) * 100),
                    currency: 'USD',
                };
            }
            if (args.employerInitialContributionAmount !== undefined) {
                input.employerInitialContributionAmount = {
                    amount: Math.round((args.employerInitialContributionAmount as number) * 100),
                    currency: 'USD',
                };
            }
            if (args.employeeRecurringContributionAmount !== undefined) {
                input.employeeRecurringContributionAmount = {
                    amount: Math.round((args.employeeRecurringContributionAmount as number) * 100),
                    currency: 'USD',
                };
            }
            if (args.employerRecurringContributionAmount !== undefined) {
                input.employerRecurringContributionAmount = {
                    amount: Math.round((args.employerRecurringContributionAmount as number) * 100),
                    currency: 'USD',
                };
            }

            return { input };
        }

        default:
            return args;
    }
}

/**
 * Extract result from GraphQL response using dot-notation path
 */
function extractResult(data: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let result: unknown = data;

    for (const part of parts) {
        if (result && typeof result === 'object' && part in result) {
            result = (result as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
    }

    return result;
}

/**
 * Create a tool handler function for a given tool definition
 */
function createToolHandler(tool: ToolDefinition, token: string) {
    return async (args: Record<string, unknown>) => {
        try {
            // Transform arguments for GraphQL
            const transformedArgs = transformArguments(tool.name, args);

            // Execute GraphQL query
            const response = await executeGraphQL(token, tool.graphqlQuery, transformedArgs);

            if (response.errors && response.errors.length > 0) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `Error: ${response.errors[0].message}`,
                        },
                    ],
                    isError: true,
                };
            }

            // Extract result using the result path
            const result = response.data ? extractResult(response.data, tool.resultPath) : null;

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        } catch (error) {
            console.error(`[MCP] Tool ${tool.name} error:`, error);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    },
                ],
                isError: true,
            };
        }
    };
}

/**
 * Register all tools with the MCP server using the new registerTool API
 */
export function registerTools(server: McpServer, token: string): void {
    for (const tool of tools) {
        // Use registerTool with config object and pass the Zod schema directly
        server.registerTool(
            tool.name,
            {
                description: tool.description,
                inputSchema: tool.inputSchema,
            },
            createToolHandler(tool, token),
        );
    }

    console.log(`[MCP] Registered ${tools.length} tools`);
}
