import { NextRequest, NextResponse } from 'next/server';
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
        const { toolName, args } = body;

        if (!toolName) {
            return NextResponse.json({ error: 'Tool name is required' }, { status: 400 });
        }

        const tool = toolByName[toolName];
        if (!tool) {
            return NextResponse.json({ error: `Tool not found: ${toolName}` }, { status: 404 });
        }

        // Transform args to match Manager API input structure
        const variables = transformArgsForTool(toolName, args || {});

        // Execute the GraphQL query against Manager API
        // Web UI users authenticate with their own Firebase tokens via Manager API
        const managerApiUrl = process.env.MANAGER_API_URL || 'https://manager.api.dev.firstdollar.com';
        const graphqlUrl = `${managerApiUrl}/graphql`;

        console.log(`[tools/execute] Calling ${graphqlUrl} for tool: ${toolName}`);
        console.log(`[tools/execute] Variables:`, JSON.stringify(variables, null, 2));

        const response = await fetch(graphqlUrl, {
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

        console.log(`[tools/execute] Response status: ${response.status}`);

        const data = await response.json();

        if (data.errors) {
            console.log(`[tools/execute] GraphQL errors:`, JSON.stringify(data.errors, null, 2));
            return NextResponse.json({ error: data.errors[0].message, errors: data.errors }, { status: 400 });
        }

        // Extract the result using the resultPath
        const pathParts = tool.resultPath.split('.');
        let result = data.data;
        for (const part of pathParts) {
            result = result?.[part];
        }

        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        console.error('[tools/execute] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 },
        );
    }
}
