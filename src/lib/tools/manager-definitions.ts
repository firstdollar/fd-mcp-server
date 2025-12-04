import { z } from 'zod';

/**
 * Tool definitions for the Manager API.
 * These tools are designed for admin users (org admins, partner admins) to interact
 * with the Manager API using their own Firebase credentials.
 */

export interface ManagerToolDefinition {
    name: string;
    description: string;
    category: string;
    inputSchema: z.ZodObject<z.ZodRawShape>;
    graphqlQuery: string;
    resultPath: string;
}

// ============================================================================
// Organizations
// ============================================================================

export const listOrganizations: ManagerToolDefinition = {
    name: 'list_organizations',
    description: 'List all organizations for the authenticated partner',
    category: 'Organizations',
    inputSchema: z.object({
        organizationName: z.string().optional().describe('Filter by organization name (exact match)'),
        organizationCode: z.string().optional().describe('Filter by organization short code'),
        pageSize: z.number().optional().describe('Number of results to return (default: 25)'),
        pageNumber: z.number().optional().describe('Page number for pagination (1-based)'),
    }),
    graphqlQuery: `
    query FilteredPartnerOrganizations($input: FilteredPartnerOrganizationsInput!) {
      filteredPartnerOrganizations(input: $input) {
        organizations {
          cursor
          node {
            organization {
              id
              name
              organizationCode
              createdAt
              availableOfferingTypes
            }
            totals {
              totalActiveMembers
              totalPendingMembers
            }
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          totalCount
        }
      }
    }
  `,
    resultPath: 'filteredPartnerOrganizations',
};

export const getOrganization: ManagerToolDefinition = {
    name: 'get_organization',
    description: 'Get details of a specific organization by code',
    category: 'Organizations',
    inputSchema: z.object({
        organizationCode: z.string().describe('The organization short code'),
    }),
    graphqlQuery: `
    query FilteredPartnerOrganizations($input: FilteredPartnerOrganizationsInput!) {
      filteredPartnerOrganizations(input: $input) {
        organizations {
          node {
            organization {
              id
              name
              organizationCode
              createdAt
              availableOfferingTypes
              disbursementMethod
              disbursementSchedule
            }
            totals {
              totalActiveMembers
              totalPendingMembers
            }
          }
        }
      }
    }
  `,
    resultPath: 'filteredPartnerOrganizations.organizations[0].node.organization',
};

export const addOrganization: ManagerToolDefinition = {
    name: 'add_organization',
    description: 'Create a new organization within a partner',
    category: 'Organizations',
    inputSchema: z.object({
        name: z.string().describe('The name of the organization to create'),
    }),
    graphqlQuery: `
    mutation AddOrganization($input: ManagerAddOrganizationInput!) {
      addOrganization(input: $input) {
        organization {
          id
          name
          organizationCode
          createdAt
        }
      }
    }
  `,
    resultPath: 'addOrganization',
};

// ============================================================================
// Members/Individuals
// ============================================================================

export const listOrganizationMembers: ManagerToolDefinition = {
    name: 'list_organization_members',
    description: 'List members (individuals) of a specific organization',
    category: 'Individuals',
    inputSchema: z.object({
        organizationCode: z.string().describe('The organization short code'),
        memberName: z.string().optional().describe('Filter by member name (first or last)'),
        filterByEmploymentStatus: z
            .enum(['Employed', 'NotEmployed'])
            .optional()
            .describe('Filter by employment status'),
        filterByDisabledStatus: z.boolean().optional().describe('Filter by disabled status'),
        includeAccountTypes: z
            .array(z.string())
            .optional()
            .describe('Filter by account types (e.g., HSA, FSA, LSA)'),
        pageSize: z.number().optional().describe('Number of results to return (default: 25)'),
        pageNumber: z.number().optional().describe('Page number for pagination (1-based)'),
    }),
    graphqlQuery: `
    query FilteredPartnerOrganizationMembers($input: FilteredPartnerOrganizationMembersInput!) {
      filteredPartnerOrganizationMembers(input: $input) {
        members {
          cursor
          node {
            uid
            email
            firstName
            lastName
            kycStatus
            isDisabled
            employmentStatus
            offeringEnrollments {
              offeringId
              offeringName
              accountType
              currentBalance {
                amount
                currency
              }
              enrollmentStatus
            }
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          totalCount
        }
      }
    }
  `,
    resultPath: 'filteredPartnerOrganizationMembers',
};

export const getPartnerUser: ManagerToolDefinition = {
    name: 'get_partner_user',
    description: 'Get details of a specific partner user by various identifiers',
    category: 'Individuals',
    inputSchema: z.object({
        uid: z.string().optional().describe('The user UID'),
        email: z.string().optional().describe('The user email'),
        externalUserId: z.string().optional().describe('The external user ID'),
    }),
    graphqlQuery: `
    query FilteredPartnerUsers($input: FilteredPartnerUsersInput!) {
      filteredPartnerUsers(input: $input) {
        users {
          node {
            uid
            email
            firstName
            lastName
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
            kycStatus
            isDisabled
            employmentStatus
            activeOrganization {
              id
              name
              organizationCode
            }
          }
        }
      }
    }
  `,
    resultPath: 'filteredPartnerUsers.users[0].node',
};

export const bulkCreateIndividuals: ManagerToolDefinition = {
    name: 'bulk_create_individuals',
    description: 'Create multiple individuals at once',
    category: 'Individuals',
    inputSchema: z.object({
        individuals: z
            .array(
                z.object({
                    firstName: z.string().describe('First name'),
                    lastName: z.string().describe('Last name'),
                    email: z.string().describe('Email address'),
                    dateOfBirth: z.string().optional().describe('Date of birth (YYYY-MM-DD)'),
                    phoneNumber: z.string().optional().describe('Phone number'),
                    ssn: z.string().optional().describe('Social Security Number'),
                    addressLine1: z.string().optional().describe('Address line 1'),
                    addressLine2: z.string().optional().describe('Address line 2'),
                    city: z.string().optional().describe('City'),
                    state: z.string().optional().describe('State'),
                    zip: z.string().optional().describe('ZIP code'),
                    externalUserId: z.string().optional().describe('External user ID'),
                    organizationCode: z.string().describe('Organization short code'),
                }),
            )
            .describe('Array of individuals to create'),
    }),
    graphqlQuery: `
    mutation BulkCreateIndividuals($input: BulkCreateIndividualsInput!) {
      bulkCreateIndividuals(input: $input) {
        ... on BulkCreateIndividualsSuccess {
          uid
          firstName
          lastName
          email
        }
        ... on BulkCreateIndividualsError {
          errorCode
          message
        }
      }
    }
  `,
    resultPath: 'bulkCreateIndividuals',
};

// ============================================================================
// Benefits/Offerings
// ============================================================================

export const listBenefitOfferings: ManagerToolDefinition = {
    name: 'list_benefit_offerings',
    description: 'List benefit offerings for an organization',
    category: 'Benefits',
    inputSchema: z.object({
        organizationCode: z.string().describe('The organization short code'),
    }),
    graphqlQuery: `
    query BenefitOffering($where: BenefitOfferingFilterInput!) {
      benefitOffering(where: $where) {
        id
        name
        accountType
        startDate
        endDate
        status
        fundingLimits {
          individual {
            amount
            currency
          }
        }
      }
    }
  `,
    resultPath: 'benefitOffering',
};

// ============================================================================
// Enrollments
// ============================================================================

export const bulkEnrollInOfferings: ManagerToolDefinition = {
    name: 'bulk_enroll_in_offerings',
    description: 'Enroll one or more individuals in benefit offerings',
    category: 'Enrollments',
    inputSchema: z.object({
        enrollments: z
            .array(
                z.object({
                    uid: z.string().describe('The user UID to enroll'),
                    offeringId: z.string().describe('The offering ID to enroll in'),
                    startDate: z.string().optional().describe('Enrollment start date (YYYY-MM-DD)'),
                    endDate: z.string().optional().describe('Enrollment end date (YYYY-MM-DD)'),
                    employeeInitialContributionAmountCents: z
                        .number()
                        .optional()
                        .describe('Employee initial contribution in cents'),
                    employerInitialContributionAmountCents: z
                        .number()
                        .optional()
                        .describe('Employer initial contribution in cents'),
                    employeeRecurringContributionAmountCents: z
                        .number()
                        .optional()
                        .describe('Employee recurring contribution in cents'),
                    employerRecurringContributionAmountCents: z
                        .number()
                        .optional()
                        .describe('Employer recurring contribution in cents'),
                }),
            )
            .describe('Array of enrollment requests'),
    }),
    graphqlQuery: `
    mutation BulkEnrollInOfferings($input: [EnrollmentRequestInput!]!) {
      bulkEnrollInOfferings(input: $input) {
        ... on BulkEnrollResponseSuccessDefinition {
          uid
          offeringId
          enrollmentStatus
        }
        ... on BulkEnrollResponseErrorDefinition {
          uid
          offeringId
          errorCode
          message
        }
      }
    }
  `,
    resultPath: 'bulkEnrollInOfferings',
};

// ============================================================================
// Current User/Partner Info
// ============================================================================

export const getCurrentAdministrator: ManagerToolDefinition = {
    name: 'get_current_administrator',
    description: 'Get details about the currently authenticated administrator',
    category: 'Utilities',
    inputSchema: z.object({}),
    graphqlQuery: `
    query CurrentAdministratorDetails {
      currentAdministratorDetails {
        administrator {
          uid
          email
          firstName
          lastName
        }
        entity {
          ... on CurrentAdministratorOrganization {
            organization {
              id
              name
              organizationCode
            }
          }
          ... on CurrentAdministratorPartner {
            partner {
              name
              shortCode
            }
          }
        }
        entityType
      }
    }
  `,
    resultPath: 'currentAdministratorDetails',
};

export const getCurrentPartner: ManagerToolDefinition = {
    name: 'get_current_partner',
    description: 'Get details about the current partner',
    category: 'Utilities',
    inputSchema: z.object({}),
    graphqlQuery: `
    query CurrentPartner {
      currentPartner {
        name
        shortCode
        kycSettings {
          isKycRequired
          isKycOptional
        }
      }
    }
  `,
    resultPath: 'currentPartner',
};

// ============================================================================
// Utility
// ============================================================================

export const ping: ManagerToolDefinition = {
    name: 'ping',
    description: 'Test the API connection and verify authentication',
    category: 'Utilities',
    inputSchema: z.object({}),
    graphqlQuery: `
    query CurrentAdministratorDetails {
      currentAdministratorDetails {
        administrator {
          email
        }
        entityType
      }
    }
  `,
    resultPath: 'currentAdministratorDetails',
};

// ============================================================================
// All tools registry
// ============================================================================

export const managerTools: ManagerToolDefinition[] = [
    // Organizations
    listOrganizations,
    getOrganization,
    addOrganization,
    // Individuals
    listOrganizationMembers,
    getPartnerUser,
    bulkCreateIndividuals,
    // Enrollments
    bulkEnrollInOfferings,
    // Utilities
    getCurrentAdministrator,
    getCurrentPartner,
    ping,
];

export const managerToolsByCategory = managerTools.reduce(
    (acc, tool) => {
        if (!acc[tool.category]) {
            acc[tool.category] = [];
        }
        acc[tool.category].push(tool);
        return acc;
    },
    {} as Record<string, ManagerToolDefinition[]>,
);

export const managerToolByName = managerTools.reduce(
    (acc, tool) => {
        acc[tool.name] = tool;
        return acc;
    },
    {} as Record<string, ManagerToolDefinition>,
);
