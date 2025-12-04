import { z } from 'zod';

export interface PartnerToolDefinition {
    name: string;
    description: string;
    category: string;
    inputSchema: z.ZodObject<z.ZodRawShape>;
    graphqlQuery: string;
    resultPath: string;
}

// Ping - Health check tool
export const ping: PartnerToolDefinition = {
    name: 'ping',
    description: 'Health check to verify API connectivity',
    category: 'System',
    inputSchema: z.object({}),
    graphqlQuery: `
    query Ping {
      __typename
    }
  `,
    resultPath: '__typename',
};

// Organizations - Partner API schema
// Organization has: id, name, shortCode
export const listOrganizations: PartnerToolDefinition = {
    name: 'list_organizations',
    description: 'List all organizations for the authenticated partner',
    category: 'Organizations',
    inputSchema: z.object({
        ids: z.array(z.string()).optional().describe('Filter by specific organization IDs'),
        first: z.number().optional().describe('Number of results to return (default: 100, max: 100)'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query GetOrganizations($where: OrganizationsFilterInput, $after: String, $first: Int) {
      organizations(where: $where, after: $after, first: $first) {
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
          code
          message
        }
      }
    }
  `,
    resultPath: 'organizations',
};

// Get Organization - Partner API (single org by ID)
export const getOrganization: PartnerToolDefinition = {
    name: 'get_organization',
    description: 'Get a specific organization by ID',
    category: 'Organizations',
    inputSchema: z.object({
        id: z.string().describe('The organization ID (ULID)'),
    }),
    graphqlQuery: `
    query GetOrganization($where: OrganizationFilterInput!) {
      organization(where: $where) {
        ... on Organization {
          id
          name
          shortCode
        }
        ... on BadRequestError {
          code
          message
        }
      }
    }
  `,
    resultPath: 'organization',
};

// Individuals - Partner API schema
// Individual has: id, name, address, mailingAddress, phoneNumber, email, tin, dateOfBirth, language
export const listIndividuals: PartnerToolDefinition = {
    name: 'list_individuals',
    description: 'List individuals (members) with filtering and pagination',
    category: 'Individuals',
    inputSchema: z.object({
        ids: z.array(z.string()).optional().describe('Filter by individual IDs'),
        organizationIds: z.array(z.string()).optional().describe('Filter by organization IDs'),
        benefitIds: z.array(z.string()).optional().describe('Filter by benefit IDs'),
        benefitsProgramIds: z.array(z.string()).optional().describe('Filter by benefits program IDs'),
        statuses: z
            .array(z.enum(['ENROLLED', 'UNENROLLED']))
            .optional()
            .describe('Filter by enrollment status'),
        first: z.number().optional().describe('Number of results (default: 100, max: 100)'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query GetIndividuals($where: IndividualsFilterInput, $after: String, $first: Int) {
      individuals(where: $where, after: $after, first: $first) {
        ... on IndividualsResults {
          nodes {
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
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        ... on BadRequestError {
          code
          message
        }
      }
    }
  `,
    resultPath: 'individuals',
};

// Create Individual - Partner API
export const createIndividual: PartnerToolDefinition = {
    name: 'create_individual',
    description: 'Create a new individual within an organization',
    category: 'Individuals',
    inputSchema: z.object({
        firstName: z.string().describe('First name of the individual'),
        lastName: z.string().describe('Last name of the individual'),
        middleName: z.string().optional().describe('Middle name (optional)'),
        email: z.string().optional().describe('Email address'),
        phoneNumber: z.string().optional().describe('Phone number'),
        dateOfBirth: z.string().optional().describe('Date of birth (YYYY-MM-DD)'),
        tin: z.string().optional().describe('Tax identification number (SSN)'),
        language: z.string().optional().describe('Preferred language (e.g., en)'),
        externalUserId: z.string().optional().describe('External user ID from your system'),
        addressLine1: z.string().optional().describe('Street address line 1'),
        addressLine2: z.string().optional().describe('Street address line 2'),
        city: z.string().optional().describe('City'),
        state: z.string().optional().describe('State code (e.g., CA, NY)'),
        zip: z.string().optional().describe('ZIP code'),
        country: z.string().optional().describe('Country code (default: US)'),
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
            phoneNumber
            email
            tin
            dateOfBirth
            language
          }
        }
        ... on BadRequestError {
          code
          message
        }
      }
    }
  `,
    resultPath: 'createIndividual',
};

// Update Individual - Partner API
export const updateIndividual: PartnerToolDefinition = {
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
        dateOfBirth: z.string().optional().describe('New date of birth (YYYY-MM-DD)'),
        tin: z.string().optional().describe('New tax identification number (SSN)'),
        language: z.string().optional().describe('New preferred language'),
        addressLine1: z.string().optional().describe('New street address line 1'),
        addressLine2: z.string().optional().describe('New street address line 2'),
        city: z.string().optional().describe('New city'),
        state: z.string().optional().describe('New state code'),
        zip: z.string().optional().describe('New ZIP code'),
        country: z.string().optional().describe('New country code'),
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
      }
    }
  `,
    resultPath: 'updateIndividual',
};

// Verify Individual - Partner API
export const verifyIndividual: PartnerToolDefinition = {
    name: 'verify_individual',
    description: 'Initiate KYC verification for an individual',
    category: 'Individuals',
    inputSchema: z.object({
        individualId: z.string().describe('The ID of the individual to verify'),
        idempotencyKey: z.string().optional().describe('Idempotency key for the request'),
    }),
    graphqlQuery: `
    mutation VerifyIndividual($input: VerifyIndividualInput!) {
      verifyIndividual(input: $input) {
        ... on VerifyIndividualResult {
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
      }
    }
  `,
    resultPath: 'verifyIndividual',
};

// Benefits Programs - Partner API
export const listBenefitsPrograms: PartnerToolDefinition = {
    name: 'list_benefits_programs',
    description: 'List benefits programs with filtering by organization',
    category: 'Benefits',
    inputSchema: z.object({
        organizationIds: z.array(z.string()).optional().describe('Filter by organization IDs'),
        first: z.number().optional().describe('Number of results (default: 100)'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query BenefitsPrograms($where: BenefitsProgramsFilterInput, $after: String, $first: Int) {
      benefitsPrograms(where: $where, after: $after, first: $first) {
        ... on BenefitsProgramsResults {
          nodes {
            id
            name
            organizationId
            benefits {
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
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        ... on BadRequestError {
          code
          message
        }
      }
    }
  `,
    resultPath: 'benefitsPrograms',
};

// Benefit Templates - Partner API
export const listBenefitTemplates: PartnerToolDefinition = {
    name: 'list_benefit_templates',
    description: 'List available benefit templates',
    category: 'Benefits',
    inputSchema: z.object({
        first: z.number().optional().describe('Number of results'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query GetBenefitTemplates($where: BenefitTemplatesFilterInput) {
      benefitTemplates(where: $where) {
        ... on BenefitTemplatesResults {
          nodes {
            id
            name
            type
            description
            configuration {
              funding {
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
          code
          message
        }
      }
    }
  `,
    resultPath: 'benefitTemplates',
};

// Create Benefits Program - Partner API
export const createBenefitsProgram: PartnerToolDefinition = {
    name: 'create_benefits_program',
    description: 'Create a new benefits program for an organization',
    category: 'Benefits',
    inputSchema: z.object({
        organizationId: z.string().describe('The organization ID'),
        name: z.string().describe('Name of the benefits program'),
    }),
    graphqlQuery: `
    mutation CreateBenefitsProgram($input: CreateBenefitsProgramInput!) {
      createBenefitsProgram(input: $input) {
        ... on CreateBenefitsProgramResult {
          benefitsProgram {
            id
            name
            organizationId
          }
        }
        ... on BadRequestError {
          code
          message
        }
      }
    }
  `,
    resultPath: 'createBenefitsProgram',
};

// Create Benefit - Partner API
export const createBenefit: PartnerToolDefinition = {
    name: 'create_benefit',
    description: 'Create a new benefit within a benefits program',
    category: 'Benefits',
    inputSchema: z.object({
        benefitsProgramId: z.string().describe('The benefits program ID'),
        templateId: z.string().describe('The benefit template ID'),
        name: z.string().describe('Name of the benefit'),
        startDate: z.string().describe('Start date (YYYY-MM-DD)'),
        endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
    }),
    graphqlQuery: `
    mutation CreateBenefit($input: CreateBenefitInput!) {
      createBenefit(input: $input) {
        ... on CreateBenefitResult {
          benefit {
            id
            name
            description
            type
            startDate
            endDate
            configuration {
              funding {
                initialFunding {
                  individual {
                    amount
                    currency
                  }
                }
                limits {
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
          code
          message
        }
      }
    }
  `,
    resultPath: 'createBenefit',
};

// Enroll Individual in Benefit - Partner API
export const enrollIndividualInBenefit: PartnerToolDefinition = {
    name: 'enroll_individual_in_benefit',
    description: 'Enroll an individual in a benefit offering',
    category: 'Enrollments',
    inputSchema: z.object({
        benefitId: z.string().describe('The benefit ID'),
        individualId: z.string().describe('The individual ID'),
        verificationId: z.string().optional().describe('Verification ID for benefits requiring verification'),
        startDate: z.string().optional().describe('Enrollment start date (YYYY-MM-DD)'),
        endDate: z.string().optional().describe('Enrollment end date (YYYY-MM-DD)'),
        employeeInitialContributionAmount: z
            .number()
            .optional()
            .describe('Initial employee contribution in dollars'),
        employerInitialContributionAmount: z
            .number()
            .optional()
            .describe('Initial employer contribution in dollars'),
        employeeRecurringContributionAmount: z
            .number()
            .optional()
            .describe('Recurring employee contribution in dollars'),
        employerRecurringContributionAmount: z
            .number()
            .optional()
            .describe('Recurring employer contribution in dollars'),
    }),
    graphqlQuery: `
    mutation EnrollIndividualInBenefit($input: EnrollIndividualInBenefitInput!) {
      enrollIndividualInBenefit(input: $input) {
        ... on EnrollIndividualInBenefitResult {
          benefit {
            id
            name
            type
            startDate
            endDate
          }
          individual {
            id
            name {
              firstName
              lastName
            }
            email
          }
        }
        ... on BadRequestError {
          code
          message
        }
      }
    }
  `,
    resultPath: 'enrollIndividualInBenefit',
};

// Create Organization - Partner API
export const createOrganization: PartnerToolDefinition = {
    name: 'create_organization',
    description: 'Create a new organization',
    category: 'Organizations',
    inputSchema: z.object({
        name: z.string().describe('Name of the organization'),
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
          code
          message
        }
      }
    }
  `,
    resultPath: 'createOrganization',
};

// All Partner API tools registry
export const partnerTools: PartnerToolDefinition[] = [
    // System
    ping,
    // Organizations
    listOrganizations,
    getOrganization,
    createOrganization,
    // Individuals
    listIndividuals,
    createIndividual,
    updateIndividual,
    verifyIndividual,
    // Benefits
    listBenefitsPrograms,
    listBenefitTemplates,
    createBenefitsProgram,
    createBenefit,
    // Enrollments
    enrollIndividualInBenefit,
];

export const partnerToolsByCategory = partnerTools.reduce(
    (acc, tool) => {
        if (!acc[tool.category]) {
            acc[tool.category] = [];
        }
        acc[tool.category].push(tool);
        return acc;
    },
    {} as Record<string, PartnerToolDefinition[]>,
);

export const partnerToolByName = partnerTools.reduce(
    (acc, tool) => {
        acc[tool.name] = tool;
        return acc;
    },
    {} as Record<string, PartnerToolDefinition>,
);
