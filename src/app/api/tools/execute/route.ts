import { NextRequest, NextResponse } from 'next/server';
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

            // Add address if any address fields are provided
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

            // Add name if any name fields are provided
            if (args.firstName || args.lastName || args.middleName) {
                const name: Record<string, unknown> = {};
                if (args.firstName) name.firstName = args.firstName;
                if (args.lastName) name.lastName = args.lastName;
                if (args.middleName) name.middleName = args.middleName;
                input.name = name;
            }

            // Add address if any address fields are provided
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

            // Add other optional fields
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

            // Convert dollar amounts to cents for MoneyInput
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
        const { toolName, args } = body;

        if (!toolName) {
            return NextResponse.json({ error: 'Tool name is required' }, { status: 400 });
        }

        const tool = toolByName[toolName];
        if (!tool) {
            return NextResponse.json({ error: `Tool not found: ${toolName}` }, { status: 404 });
        }

        // Transform args for mutations
        const isMutation = MUTATION_TOOLS.includes(toolName);
        const variables = isMutation ? transformArgsForMutation(toolName, args || {}) : args || {};

        // Execute the GraphQL query against Manager API
        // Web UI users authenticate with their own Firebase tokens via Manager API
        const managerApiUrl = process.env.MANAGER_API_URL || 'https://manager.dev.firstdollar.com';
        const response = await fetch(`${managerApiUrl}/graphql`, {
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

        const data = await response.json();

        if (data.errors) {
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
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 },
        );
    }
}
