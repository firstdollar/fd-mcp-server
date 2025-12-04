/**
 * MCP Tool Registration for Manager API
 *
 * Registers Manager API tools with the MCP server using the official SDK.
 * Tools are defined in ../lib/tools/manager-definitions.ts and registered using Zod schemas.
 *
 * These tools are designed for admin users (org admins, partner admins) who authenticate
 * with their own Firebase tokens via the Manager API.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { managerTools, type ManagerToolDefinition } from '../lib/tools/manager-definitions.js';

const MANAGER_API_URL = process.env.MANAGER_API_URL || 'https://manager.dev.firstdollar.com';

/**
 * Execute a GraphQL query against the Manager API
 */
async function executeGraphQL(
    token: string,
    query: string,
    variables: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string }> }> {
    const response = await fetch(`${MANAGER_API_URL}/graphql`, {
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
 * Manager API has different input structures than Partner API.
 */
function transformArguments(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    switch (toolName) {
        case 'list_organizations':
            return {
                input: {
                    ...(args.organizationName ? { organizationName: args.organizationName } : {}),
                    ...(args.organizationCode ? { organizationCode: args.organizationCode } : {}),
                    ...(args.pageSize || args.pageNumber
                        ? {
                              page: {
                                  ...(args.pageSize ? { size: args.pageSize } : {}),
                                  ...(args.pageNumber ? { number: args.pageNumber } : {}),
                              },
                          }
                        : {}),
                },
            };

        case 'get_organization':
            return {
                input: {
                    organizationCode: args.organizationCode,
                },
            };

        case 'add_organization':
            return {
                input: {
                    name: args.name,
                },
            };

        case 'list_organization_members':
            return {
                input: {
                    organizationCode: args.organizationCode,
                    ...(args.memberName ? { memberName: args.memberName } : {}),
                    ...(args.filterByEmploymentStatus
                        ? { filterByEmploymentStatus: args.filterByEmploymentStatus }
                        : {}),
                    ...(args.filterByDisabledStatus !== undefined
                        ? { filterByDisabledStatus: args.filterByDisabledStatus }
                        : {}),
                    ...(args.includeAccountTypes ? { includeAccountTypes: args.includeAccountTypes } : {}),
                    ...(args.pageSize || args.pageNumber
                        ? {
                              page: {
                                  ...(args.pageSize ? { size: args.pageSize } : {}),
                                  ...(args.pageNumber ? { number: args.pageNumber } : {}),
                              },
                          }
                        : {}),
                },
            };

        case 'get_partner_user':
            return {
                input: {
                    ...(args.uid ? { uid: args.uid } : {}),
                    ...(args.email ? { email: args.email } : {}),
                    ...(args.externalUserId ? { externalUserId: args.externalUserId } : {}),
                },
            };

        case 'bulk_create_individuals':
            return {
                input: {
                    individuals: (args.individuals as Array<Record<string, unknown>>).map((ind) => ({
                        firstName: ind.firstName,
                        lastName: ind.lastName,
                        email: ind.email,
                        organizationCode: ind.organizationCode,
                        ...(ind.dateOfBirth ? { dateOfBirth: ind.dateOfBirth } : {}),
                        ...(ind.phoneNumber ? { phoneNumber: ind.phoneNumber } : {}),
                        ...(ind.ssn ? { ssn: ind.ssn } : {}),
                        ...(ind.externalUserId ? { externalUserId: ind.externalUserId } : {}),
                        ...(ind.addressLine1
                            ? {
                                  address: {
                                      addressLine1: ind.addressLine1,
                                      ...(ind.addressLine2 ? { addressLine2: ind.addressLine2 } : {}),
                                      ...(ind.city ? { city: ind.city } : {}),
                                      ...(ind.state ? { state: ind.state } : {}),
                                      ...(ind.zip ? { zip: ind.zip } : {}),
                                  },
                              }
                            : {}),
                    })),
                },
            };

        case 'bulk_enroll_in_offerings':
            return {
                input: (args.enrollments as Array<Record<string, unknown>>).map((enrollment) => ({
                    uid: enrollment.uid,
                    offeringId: enrollment.offeringId,
                    ...(enrollment.startDate ? { startDate: enrollment.startDate } : {}),
                    ...(enrollment.endDate ? { endDate: enrollment.endDate } : {}),
                    ...(enrollment.employeeInitialContributionAmountCents !== undefined
                        ? {
                              employeeInitialContributionAmount: {
                                  amount: enrollment.employeeInitialContributionAmountCents,
                                  currency: 'USD',
                              },
                          }
                        : {}),
                    ...(enrollment.employerInitialContributionAmountCents !== undefined
                        ? {
                              employerInitialContributionAmount: {
                                  amount: enrollment.employerInitialContributionAmountCents,
                                  currency: 'USD',
                              },
                          }
                        : {}),
                    ...(enrollment.employeeRecurringContributionAmountCents !== undefined
                        ? {
                              employeeRecurringContributionAmount: {
                                  amount: enrollment.employeeRecurringContributionAmountCents,
                                  currency: 'USD',
                              },
                          }
                        : {}),
                    ...(enrollment.employerRecurringContributionAmountCents !== undefined
                        ? {
                              employerRecurringContributionAmount: {
                                  amount: enrollment.employerRecurringContributionAmountCents,
                                  currency: 'USD',
                              },
                          }
                        : {}),
                })),
            };

        case 'list_benefit_offerings':
            return {
                where: {
                    organizationCode: args.organizationCode,
                },
            };

        // These tools don't need transformation
        case 'get_current_administrator':
        case 'get_current_partner':
        case 'ping':
        default:
            return args;
    }
}

/**
 * Extract result from GraphQL response using dot-notation path with array index support
 */
function extractResult(data: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let result: unknown = data;

    for (const part of parts) {
        if (result && typeof result === 'object') {
            // Check for array index syntax like "organizations[0]"
            const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
            if (arrayMatch) {
                const [, key, indexStr] = arrayMatch;
                const index = parseInt(indexStr, 10);
                result = (result as Record<string, unknown>)[key];
                if (Array.isArray(result) && index < result.length) {
                    result = result[index];
                } else {
                    return undefined;
                }
            } else if (part in result) {
                result = (result as Record<string, unknown>)[part];
            } else {
                return undefined;
            }
        } else {
            return undefined;
        }
    }

    return result;
}

/**
 * Create a tool handler function for a given tool definition
 */
function createToolHandler(tool: ManagerToolDefinition, token: string) {
    return async (args: Record<string, unknown>) => {
        try {
            // Transform arguments for GraphQL
            const transformedArgs = transformArguments(tool.name, args);

            console.log(`[MCP Manager] Executing tool: ${tool.name}`);

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
            console.error(`[MCP Manager] Tool ${tool.name} error:`, error);
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
 * Register all Manager API tools with the MCP server
 */
export function registerManagerTools(server: McpServer, token: string): void {
    for (const tool of managerTools) {
        server.registerTool(
            tool.name,
            {
                description: tool.description,
                inputSchema: tool.inputSchema,
            },
            createToolHandler(tool, token),
        );
    }

    console.log(`[MCP Manager] Registered ${managerTools.length} Manager API tools`);
}
