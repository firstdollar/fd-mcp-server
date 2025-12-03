import { z } from 'zod';

export interface ToolDefinition {
    name: string;
    description: string;
    category: string;
    inputSchema: z.ZodObject<z.ZodRawShape>;
    graphqlQuery: string;
    resultPath: string;
}

// Organizations
export const listOrganizations: ToolDefinition = {
    name: 'list_organizations',
    description: 'List all organizations for the authenticated partner',
    category: 'Organizations',
    inputSchema: z.object({
        first: z.number().optional().describe('Number of results to return (default: 100)'),
        after: z.string().optional().describe('Cursor for pagination (from previous pageInfo.endCursor)'),
    }),
    graphqlQuery: `
    query ListOrganizations($first: Int, $after: String) {
      organizations(first: $first, after: $after) {
        ... on OrganizationsResults {
          nodes {
            id
            name
            shortCode
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        ... on BadRequestError {
          message
        }
        ... on InternalServerError {
          message
        }
      }
    }
  `,
    resultPath: 'organizations',
};

export const getOrganization: ToolDefinition = {
    name: 'get_organization',
    description:
        'Get details of a specific organization by ID (use the id field from list_organizations, not shortCode)',
    category: 'Organizations',
    inputSchema: z.object({
        id: z.string().describe('The organization ID (ULID format like "01ABC...", not the shortCode)'),
    }),
    graphqlQuery: `
    query GetOrganization($id: ID!) {
      organization(where: { id: $id }) {
        ... on Organization {
          id
          name
          shortCode
        }
        ... on BadRequestError {
          message
        }
        ... on InternalServerError {
          message
        }
      }
    }
  `,
    resultPath: 'organization',
};

// Individuals
export const listIndividuals: ToolDefinition = {
    name: 'list_individuals',
    description: 'List individuals (members) for the authenticated partner',
    category: 'Individuals',
    inputSchema: z.object({
        first: z.number().optional().describe('Number of results to return (default: 100)'),
        after: z.string().optional().describe('Cursor for pagination'),
        organizationIds: z.array(z.string()).optional().describe('Filter by organization IDs'),
        benefitIds: z.array(z.string()).optional().describe('Filter by benefit IDs'),
        benefitsProgramIds: z.array(z.string()).optional().describe('Filter by benefits program IDs'),
    }),
    graphqlQuery: `
    query ListIndividuals($first: Int, $after: String, $organizationIds: [ID!], $benefitIds: [ID!], $benefitsProgramIds: [ID!]) {
      individuals(
        first: $first,
        after: $after,
        where: {
          organizationIds: $organizationIds,
          benefitIds: $benefitIds,
          benefitsProgramIds: $benefitsProgramIds
        }
      ) {
        ... on IndividualsResults {
          nodes {
            id
            name {
              firstName
              lastName
            }
            email
            dateOfBirth
            phoneNumber
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        ... on BadRequestError {
          message
        }
        ... on InternalServerError {
          message
        }
      }
    }
  `,
    resultPath: 'individuals',
};

export const getIndividual: ToolDefinition = {
    name: 'get_individual',
    description: 'Get details of a specific individual by ID',
    category: 'Individuals',
    inputSchema: z.object({
        id: z.string().describe('The individual ID'),
    }),
    graphqlQuery: `
    query GetIndividual($id: ID!) {
      individual(where: { id: $id }) {
        ... on Individual {
          id
          name {
            firstName
            lastName
          }
          email
          dateOfBirth
          phoneNumber
          address {
            addressLine1
            addressLine2
            city
            state
            zip
            country
          }
          healthWallet {
            accounts {
              id
              active
              currentBalance {
                amount
                currency
              }
              availableBalance {
                amount
                currency
              }
              benefit {
                id
                name
                type
              }
            }
          }
          organizationMemberships(first: 10) {
            nodes {
              externalUserId
              organization {
                id
                name
              }
            }
          }
        }
        ... on BadRequestError {
          message
        }
        ... on InternalServerError {
          message
        }
      }
    }
  `,
    resultPath: 'individual',
};

// Benefits Programs
export const listBenefitsPrograms: ToolDefinition = {
    name: 'list_benefits_programs',
    description: 'List benefits programs for the authenticated partner',
    category: 'Benefits',
    inputSchema: z.object({
        first: z.number().optional().describe('Number of results to return'),
        after: z.string().optional().describe('Cursor for pagination'),
        organizationIds: z.array(z.string()).optional().describe('Filter by organization IDs'),
    }),
    graphqlQuery: `
    query ListBenefitsPrograms($first: Int, $after: String, $organizationIds: [ID!]) {
      benefitsPrograms(first: $first, after: $after, where: { organizationIds: $organizationIds }) {
        ... on BenefitsProgramsResults {
          nodes {
            id
            name
            organizationId
            benefits {
              id
              name
              type
              description
              startDate
              endDate
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        ... on BadRequestError {
          message
        }
        ... on InternalServerError {
          message
        }
      }
    }
  `,
    resultPath: 'benefitsPrograms',
};

export const getBenefitsProgram: ToolDefinition = {
    name: 'get_benefits_program',
    description: 'Get details of a specific benefits program by ID',
    category: 'Benefits',
    inputSchema: z.object({
        id: z.string().describe('The benefits program ID'),
    }),
    graphqlQuery: `
    query GetBenefitsProgram($id: ID!) {
      benefitsProgram(where: { id: $id }) {
        ... on BenefitsProgram {
          id
          name
          organizationId
          benefits {
            id
            name
            type
            description
            startDate
            endDate
            configuration {
              funding {
                limits {
                  individual {
                    amount
                    currency
                  }
                }
                initialFunding {
                  individual {
                    amount
                    currency
                  }
                }
              }
            }
          }
        }
        ... on BadRequestError {
          message
        }
        ... on InternalServerError {
          message
        }
      }
    }
  `,
    resultPath: 'benefitsProgram',
};

// Benefits
export const getBenefit: ToolDefinition = {
    name: 'get_benefit',
    description: 'Get details of a specific benefit by ID',
    category: 'Benefits',
    inputSchema: z.object({
        id: z.string().describe('The benefit ID'),
    }),
    graphqlQuery: `
    query GetBenefit($id: ID!) {
      benefit(where: { id: $id }) {
        ... on Benefit {
          id
          name
          type
          description
          startDate
          endDate
          configuration {
            funding {
              limits {
                individual {
                  amount
                  currency
                }
              }
              initialFunding {
                individual {
                  amount
                  currency
                }
              }
            }
          }
        }
        ... on BadRequestError {
          message
        }
        ... on InternalServerError {
          message
        }
      }
    }
  `,
    resultPath: 'benefit',
};

// Benefit Templates
export const listBenefitTemplates: ToolDefinition = {
    name: 'list_benefit_templates',
    description: 'List available benefit templates',
    category: 'Benefits',
    inputSchema: z.object({
        first: z.number().optional().describe('Number of results to return'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query ListBenefitTemplates($first: Int, $after: String) {
      benefitTemplates(first: $first, after: $after) {
        ... on BenefitTemplatesResults {
          nodes {
            id
            name
            type
            description
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        ... on BadRequestError {
          message
        }
        ... on InternalServerError {
          message
        }
      }
    }
  `,
    resultPath: 'benefitTemplates',
};

// Mutations - Create Organization
export const createOrganization: ToolDefinition = {
    name: 'create_organization',
    description: 'Create a new organization within a partner',
    category: 'Organizations',
    inputSchema: z.object({
        name: z.string().describe('The name of the organization to create'),
    }),
    graphqlQuery: `
    mutation CreateOrganization($input: CreateOrganizationInput!) {
      createOrganization(input: $input) {
        ... on CreateOrganizationResult {
          organization {
            id
            name
            shortCode
          }
        }
        ... on BadRequestError {
          message
          code
        }
      }
    }
  `,
    resultPath: 'createOrganization',
};

// Mutations - Create Individual
export const createIndividual: ToolDefinition = {
    name: 'create_individual',
    description: 'Create a new individual within an organization',
    category: 'Individuals',
    inputSchema: z.object({
        firstName: z.string().describe('First name of the individual'),
        lastName: z.string().describe('Last name of the individual'),
        middleName: z.string().optional().describe('Middle name of the individual'),
        email: z.string().optional().describe('Email address'),
        phoneNumber: z.string().optional().describe('Phone number'),
        dateOfBirth: z.string().optional().describe('Date of birth in YYYY-MM-DD format'),
        tin: z.string().optional().describe('Tax identification number (SSN)'),
        addressLine1: z.string().optional().describe('Primary address line'),
        addressLine2: z.string().optional().describe('Secondary address line'),
        city: z.string().optional().describe('City'),
        state: z.string().optional().describe('State abbreviation (e.g., CA, NY)'),
        zip: z.string().optional().describe('ZIP code'),
        country: z.string().optional().describe('Country code (defaults to US)'),
        language: z.string().optional().describe('Preferred language (defaults to en)'),
        externalUserId: z.string().optional().describe('External user ID'),
    }),
    graphqlQuery: `
    mutation CreateIndividual($input: CreateIndividualInput!) {
      createIndividual(input: $input) {
        ... on CreateIndividualResult {
          individual {
            id
            name {
              firstName
              middleName
              lastName
            }
            address {
              addressLine1
              addressLine2
              city
              state
              country
              zip
            }
            mailingAddress {
              addressLine1
              addressLine2
              city
              state
              country
              zip
            }
            phoneNumber
            email
            tin
            dateOfBirth
            language
          }
        }
        ... on BadRequestError {
          message
          code
        }
      }
    }
  `,
    resultPath: 'createIndividual',
};

// Mutations - Update Individual
export const updateIndividual: ToolDefinition = {
    name: 'update_individual',
    description: 'Update an existing individual with new information',
    category: 'Individuals',
    inputSchema: z.object({
        id: z.string().describe('The ID of the individual to update'),
        firstName: z.string().optional().describe('New first name'),
        lastName: z.string().optional().describe('New last name'),
        middleName: z.string().optional().describe('New middle name'),
        email: z.string().optional().describe('New email address'),
        phoneNumber: z.string().optional().describe('New phone number'),
        dateOfBirth: z.string().optional().describe('New date of birth in YYYY-MM-DD format'),
        tin: z.string().optional().describe('New tax identification number'),
        addressLine1: z.string().optional().describe('New primary address line'),
        addressLine2: z.string().optional().describe('New secondary address line'),
        city: z.string().optional().describe('New city'),
        state: z.string().optional().describe('New state abbreviation'),
        zip: z.string().optional().describe('New ZIP code'),
        country: z.string().optional().describe('New country code'),
        language: z.string().optional().describe('New language preference'),
    }),
    graphqlQuery: `
    mutation UpdateIndividual($input: UpdateIndividualInput!) {
      updateIndividual(input: $input) {
        ... on UpdateIndividualResult {
          individual {
            id
            name {
              firstName
              middleName
              lastName
            }
            address {
              addressLine1
              addressLine2
              city
              state
              country
              zip
            }
            mailingAddress {
              addressLine1
              addressLine2
              city
              state
              country
              zip
            }
            phoneNumber
            email
            tin
            dateOfBirth
            language
            verifications {
              id
              status
              verificationCodes
            }
          }
        }
        ... on BadRequestError {
          code
          message
        }
        ... on InternalServerError {
          code
          message
        }
      }
    }
  `,
    resultPath: 'updateIndividual',
};

// Mutations - Verify Individual
export const verifyIndividual: ToolDefinition = {
    name: 'verify_individual',
    description: 'Verify an individual through KYC (Know Your Customer) checks',
    category: 'Individuals',
    inputSchema: z.object({
        individualId: z.string().describe('The ID of the individual to verify'),
        idempotencyKey: z.string().optional().describe('A unique idempotency key for this request'),
    }),
    graphqlQuery: `
    mutation VerifyIndividual($input: VerifyIndividualInput!) {
      verifyIndividual(input: $input) {
        ... on VerifyIndividualResult {
          individual {
            id
            name {
              firstName
              middleName
              lastName
            }
            address {
              addressLine1
              addressLine2
              city
              state
              country
              zip
            }
            mailingAddress {
              addressLine1
              addressLine2
              city
              state
              country
              zip
            }
            phoneNumber
            email
            tin
            dateOfBirth
            language
            verifications {
              id
              status
              verificationCodes
            }
          }
          verification {
            id
            status
            verificationCodes
          }
        }
        ... on BadRequestError {
          code
          message
        }
        ... on InternalServerError {
          code
          message
        }
      }
    }
  `,
    resultPath: 'verifyIndividual',
};

// Mutations - Enroll Individual in Benefit
export const enrollIndividualInBenefit: ToolDefinition = {
    name: 'enroll_individual_in_benefit',
    description: 'Enroll an individual in a benefit program',
    category: 'Benefits',
    inputSchema: z.object({
        benefitId: z.string().describe('The ID of the benefit to enroll the individual in'),
        individualId: z.string().describe('The ID of the individual to enroll'),
        verificationId: z
            .string()
            .optional()
            .describe('The ID of a verification (for benefits requiring verification)'),
        startDate: z.string().optional().describe('Start date of enrollment in YYYY-MM-DD format'),
        endDate: z.string().optional().describe('End date of enrollment in YYYY-MM-DD format'),
        employeeInitialContributionAmount: z
            .number()
            .optional()
            .describe('Initial contribution amount from employee in dollars'),
        employerInitialContributionAmount: z
            .number()
            .optional()
            .describe('Initial contribution amount from employer in dollars'),
        employeeRecurringContributionAmount: z
            .number()
            .optional()
            .describe('Recurring contribution amount from employee in dollars'),
        employerRecurringContributionAmount: z
            .number()
            .optional()
            .describe('Recurring contribution amount from employer in dollars'),
    }),
    graphqlQuery: `
    mutation EnrollIndividualInBenefit($input: EnrollIndividualInBenefitInput!) {
      enrollIndividualInBenefit(input: $input) {
        ... on EnrollIndividualInBenefitResult {
          benefit {
            id
            name
            description
            type
            startDate
            endDate
            configuration {
              funding {
                limits {
                  individual {
                    amount
                    currency
                  }
                }
                initialFunding {
                  individual {
                    amount
                    currency
                  }
                }
              }
            }
          }
          individual {
            id
            name {
              firstName
              middleName
              lastName
            }
            address {
              addressLine1
              addressLine2
              city
              state
              country
              zip
            }
            mailingAddress {
              addressLine1
              addressLine2
              city
              state
              country
              zip
            }
            phoneNumber
            email
            tin
            dateOfBirth
            language
            verifications {
              id
              status
              verificationCodes
            }
          }
        }
        ... on BadRequestError {
          code
          message
        }
        ... on InternalServerError {
          code
          message
        }
      }
    }
  `,
    resultPath: 'enrollIndividualInBenefit',
};

// Utility
export const ping: ToolDefinition = {
    name: 'ping',
    description: 'Test the API connection',
    category: 'Utilities',
    inputSchema: z.object({}),
    graphqlQuery: `
    query Ping {
      ping
    }
  `,
    resultPath: 'ping',
};

// All tools registry
export const tools: ToolDefinition[] = [
    // Organizations
    listOrganizations,
    getOrganization,
    createOrganization,
    // Individuals
    listIndividuals,
    getIndividual,
    createIndividual,
    updateIndividual,
    verifyIndividual,
    // Benefits
    listBenefitsPrograms,
    getBenefitsProgram,
    getBenefit,
    listBenefitTemplates,
    enrollIndividualInBenefit,
    // Utilities
    ping,
];

export const toolsByCategory = tools.reduce(
    (acc, tool) => {
        if (!acc[tool.category]) {
            acc[tool.category] = [];
        }
        acc[tool.category].push(tool);
        return acc;
    },
    {} as Record<string, ToolDefinition[]>,
);

export const toolByName = tools.reduce(
    (acc, tool) => {
        acc[tool.name] = tool;
        return acc;
    },
    {} as Record<string, ToolDefinition>,
);
