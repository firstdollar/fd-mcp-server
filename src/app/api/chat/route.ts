import { NextRequest, NextResponse } from 'next/server';
import { selectToolWithClaude, generateResponseWithClaude } from '@/lib/claude-client';
import { toolByName } from '@/lib/tools/definitions';

// Mutations that require wrapping args in an input object
const MUTATION_TOOLS = [
    'create_organization',
    'create_individual',
    'update_individual',
    'verify_individual',
    'enroll_individual_in_benefit',
];

/**
 * Transform flat args into the nested structure expected by the GraphQL mutation
 */
function transformArgsForMutation(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    switch (toolName) {
        case 'create_organization':
            return { input: { name: args.name } };

        case 'create_individual': {
            const name: Record<string, unknown> = {
                firstName: args.firstName,
                lastName: args.lastName,
            };
            if (args.middleName) name.middleName = args.middleName;

            const individual: Record<string, unknown> = { name };
            if (args.email) individual.email = args.email;
            if (args.phoneNumber) individual.phoneNumber = args.phoneNumber;
            if (args.dateOfBirth) individual.dateOfBirth = args.dateOfBirth;
            if (args.tin) individual.tin = args.tin;
            if (args.language) individual.language = args.language;
            if (args.externalUserId) individual.externalUserId = args.externalUserId;

            if (args.addressLine1 || args.city || args.state || args.zip) {
                const address: Record<string, unknown> = {};
                if (args.addressLine1) address.addressLine1 = args.addressLine1;
                if (args.addressLine2) address.addressLine2 = args.addressLine2;
                if (args.city) address.city = args.city;
                if (args.state) address.state = (args.state as string).toUpperCase();
                if (args.zip) address.zip = args.zip;
                if (args.country) address.country = args.country;
                individual.address = address;
            }

            return { input: { individual } };
        }

        case 'update_individual': {
            const input: Record<string, unknown> = { id: args.id };

            if (args.firstName || args.lastName || args.middleName) {
                const name: Record<string, unknown> = {};
                if (args.firstName) name.firstName = args.firstName;
                if (args.lastName) name.lastName = args.lastName;
                if (args.middleName) name.middleName = args.middleName;
                input.name = name;
            }

            if (args.addressLine1 || args.addressLine2 || args.city || args.state || args.zip || args.country) {
                const address: Record<string, unknown> = {};
                if (args.addressLine1) address.addressLine1 = args.addressLine1;
                if (args.addressLine2) address.addressLine2 = args.addressLine2;
                if (args.city) address.city = args.city;
                if (args.state) address.state = (args.state as string).toUpperCase();
                if (args.zip) address.zip = args.zip;
                if (args.country) address.country = args.country;
                input.address = address;
            }

            if (args.email) input.email = args.email;
            if (args.phoneNumber) input.phoneNumber = args.phoneNumber;
            if (args.dateOfBirth) input.dateOfBirth = args.dateOfBirth;
            if (args.tin) input.tin = args.tin;
            if (args.language) input.language = args.language;

            return { input };
        }

        case 'verify_individual': {
            const idempotencyKey =
                args.idempotencyKey ||
                `verify-${args.individualId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            return {
                input: {
                    individualId: args.individualId,
                    idempotencyKey,
                },
            };
        }

        case 'enroll_individual_in_benefit': {
            const input: Record<string, unknown> = {
                benefitId: args.benefitId,
                individualId: args.individualId,
            };

            if (args.verificationId) input.verificationId = args.verificationId;
            if (args.startDate) input.startDate = args.startDate;
            if (args.endDate) input.endDate = args.endDate;

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
                response: `I couldn't find a suitable tool for your request. Available operations include listing/creating organizations, listing/creating/updating individuals, managing benefits programs, and enrolling individuals in benefits.`,
                toolUsed: null,
            });
        }

        // Step 2: Execute the tool
        const isMutation = MUTATION_TOOLS.includes(toolSelection.tool);
        const variables = isMutation
            ? transformArgsForMutation(toolSelection.tool, toolSelection.params || {})
            : toolSelection.params || {};

        // Use Manager API for web UI - users authenticate with their own Firebase tokens
        // which have the correct permissions for their admin role (org admin, partner admin, etc.)
        const managerApiUrl = process.env.MANAGER_API_URL || 'https://manager.dev.firstdollar.com';
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
