import { NextRequest, NextResponse } from 'next/server';
import { selectToolWithClaude, generateResponseWithClaude } from '@/lib/claude-client';
import { toolByName } from '@/lib/tools/definitions';

/**
 * Transform flat args into the nested structure expected by the Manager API GraphQL queries.
 * Most Manager API queries expect an `input` object with specific fields.
 * PageInput uses: first, after (not size, cursor)
 */
function transformArgsForTool(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    switch (toolName) {
        case 'list_organizations': {
            const input: Record<string, unknown> = {};
            if (args.organizationName) input.organizationName = args.organizationName;
            if (args.organizationCode) input.organizationCode = args.organizationCode;
            if (args.first || args.after) {
                input.page = {
                    ...(args.first ? { first: args.first } : {}),
                    ...(args.after ? { after: args.after } : {}),
                };
            }
            return { input };
        }

        case 'get_organization': {
            return {
                input: {
                    organizationCode: args.organizationCode,
                },
            };
        }

        case 'list_organization_members': {
            const input: Record<string, unknown> = {
                organizationCode: args.organizationCode,
            };
            if (args.memberName) input.memberName = args.memberName;
            if (args.filterByDisabledStatus !== undefined) input.filterByDisabledStatus = args.filterByDisabledStatus;
            if (args.filterByEmploymentStatus) input.filterByEmploymentStatus = args.filterByEmploymentStatus;
            if (args.first || args.after) {
                input.page = {
                    ...(args.first ? { first: args.first } : {}),
                    ...(args.after ? { after: args.after } : {}),
                };
            }
            return { input };
        }

        case 'list_users': {
            const input: Record<string, unknown> = {};
            if (args.organizationCodes) input.organizationCodes = args.organizationCodes;
            if (args.name) input.name = args.name;
            if (args.uid) input.uid = args.uid;
            if (args.externalUserId) input.externalUserId = args.externalUserId;
            if (args.employeeId) input.employeeId = args.employeeId;
            if (args.kycStatus) input.kycStatus = args.kycStatus;
            if (args.first || args.after) {
                input.page = {
                    ...(args.first ? { first: args.first } : {}),
                    ...(args.after ? { after: args.after } : {}),
                };
            }
            return { input };
        }

        case 'get_user_details': {
            const input: Record<string, unknown> = {
                uid: args.uid,
            };
            if (args.includeInactiveOrganizationMemberships !== undefined) {
                input.includeInactiveOrganizationMemberships = args.includeInactiveOrganizationMemberships;
            }
            return { input };
        }

        case 'list_benefits_programs': {
            const input: Record<string, unknown> = {
                organizationCode: args.organizationCode,
            };
            if (args.first || args.after) {
                input.page = {
                    ...(args.first ? { first: args.first } : {}),
                    ...(args.after ? { after: args.after } : {}),
                };
            }
            return { input };
        }

        case 'list_offering_templates': {
            const input: Record<string, unknown> = {
                partnerCode: args.partnerCode,
            };
            if (args.first || args.after) {
                input.page = {
                    ...(args.first ? { first: args.first } : {}),
                    ...(args.after ? { after: args.after } : {}),
                };
            }
            return { input };
        }

        case 'list_claims': {
            const input: Record<string, unknown> = {};
            if (args.organizationCodes) input.organizationCodes = args.organizationCodes;
            if (args.partnerCodes) input.partnerCodes = args.partnerCodes;
            if (args.statuses) input.statuses = args.statuses;
            if (args.userIds) input.userIds = args.userIds;
            if (args.userFullName) input.userFullName = args.userFullName;
            if (args.offeringTypes) input.offeringTypes = args.offeringTypes;
            if (args.startDate) input.startDate = args.startDate;
            if (args.endDate) input.endDate = args.endDate;
            if (args.first || args.after) {
                input.page = {
                    ...(args.first ? { first: args.first } : {}),
                    ...(args.after ? { after: args.after } : {}),
                };
            }
            return { input };
        }

        // These queries don't need input transformation
        case 'get_current_partner':
        case 'get_current_administrator':
            return {};

        // New mutation tools
        case 'create_or_return_root_benefits_program': {
            return {
                input: {
                    organizationCode: args.organizationCode,
                },
            };
        }

        case 'create_benefits_offering': {
            return {
                input: {
                    benefitsProgramId: args.benefitsProgramId,
                    offering: {
                        template: args.templateId,
                        name: args.name,
                        description: args.description,
                        dates: {
                            startDate: args.startDate,
                            ...(args.endDate ? { endDate: args.endDate } : {}),
                        },
                        ...(args.internalName ? { internalName: args.internalName } : {}),
                        // Configuration is required but we use minimal defaults from template
                        configuration: {},
                    },
                },
            };
        }

        case 'bulk_create_individuals': {
            return {
                input: {
                    organizationUlid: args.organizationUlid,
                    individuals: args.individuals,
                },
            };
        }

        case 'bulk_enroll_in_offerings': {
            // This mutation takes the array directly, not wrapped in input
            return {
                input: args.enrollments,
            };
        }

        case 'unenroll_participant_from_offerings': {
            return {
                input: {
                    participantUid: args.participantUid,
                    offeringIds: args.offeringIds,
                    ...(args.effectiveAt ? { effectiveAt: args.effectiveAt } : {}),
                    ...(args.sendEmailConfirmation !== undefined
                        ? { sendEmailConfirmation: args.sendEmailConfirmation }
                        : {}),
                },
            };
        }

        default:
            return args || {};
    }
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.substring(7);
        const body = await request.json();
        const { message } = body;

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Step 1: Use Claude to select the appropriate tool
        const toolSelection = await selectToolWithClaude(message);
        console.log(`Tool selection: ${toolSelection.tool}`, toolSelection);

        const tool = toolByName[toolSelection.tool];
        if (!tool) {
            return NextResponse.json({
                response: `I couldn't find a suitable tool for your request. Available operations include listing organizations, listing users, viewing benefits programs, claims, and more.`,
                toolUsed: null,
            });
        }

        // Step 2: Execute the tool - transform args to match Manager API input structure
        const variables = transformArgsForTool(toolSelection.tool, toolSelection.params || {});

        // Use Manager API for web UI - users authenticate with their own Firebase tokens
        // which have the correct permissions for their admin role (org admin, partner admin, etc.)
        const managerApiUrl = process.env.MANAGER_API_URL || 'https://manager.api.dev.firstdollar.com';
        const graphqlResponse = await fetch(`${managerApiUrl}/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                query: tool.graphqlQuery,
                variables,
            }),
        });

        const data = await graphqlResponse.json();

        let toolResult;
        if (data.errors) {
            toolResult = { success: false, error: data.errors[0].message, errors: data.errors };
        } else {
            const pathParts = tool.resultPath.split('.');
            let result = data.data;
            for (const part of pathParts) {
                result = result?.[part];
            }
            toolResult = { success: true, data: result };
        }

        // Step 3: Generate a conversational response with Claude
        const response = await generateResponseWithClaude(
            message,
            toolSelection.tool,
            toolResult,
            toolSelection.reasoning,
        );

        return NextResponse.json({
            response,
            toolUsed: toolSelection.tool,
            reasoning: toolSelection.reasoning,
            confidence: toolSelection.confidence,
        });
    } catch (error) {
        console.error('Chat API error:', error);
        return NextResponse.json(
            {
                response: `I encountered an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 },
        );
    }
}
