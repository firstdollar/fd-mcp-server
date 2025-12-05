import { z } from 'zod';

/** Admin types that can access tools */
export type AdministeredEntityType = 'PARTNER' | 'ORGANIZATION';

export interface ToolDefinition {
    name: string;
    description: string;
    category: string;
    inputSchema: z.ZodObject<z.ZodRawShape>;
    graphqlQuery: string;
    resultPath: string;
    /** Which admin types can access this tool. If not specified, all types can access. */
    allowedAdminTypes?: AdministeredEntityType[];
    /** If true, organizationCode will be auto-filled for org admins */
    orgScoped?: boolean;
}

// Organizations - using Manager API schema
// Organization type has: id, name, organizationCode (not shortCode)
// PageInput uses: first, after (not size, cursor)
export const listOrganizations: ToolDefinition = {
    name: 'list_organizations',
    description: 'List all organizations for the authenticated partner',
    category: 'Organizations',
    inputSchema: z.object({
        organizationName: z.string().optional().describe('Filter by organization name (exact match)'),
        organizationCode: z.string().optional().describe('Filter by organization short code'),
        first: z.number().optional().describe('Number of results to return (default: 25)'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query ListOrganizations($input: FilteredPartnerOrganizationsInput!) {
      filteredPartnerOrganizations(input: $input) {
        pageInfo {
          hasNextPage
          endCursor
        }
        organizations {
          cursor
          node {
            organization {
              id
              name
              organizationCode
            }
            totals {
              numberOfMembers
            }
          }
        }
      }
    }
  `,
    resultPath: 'filteredPartnerOrganizations',
    allowedAdminTypes: ['PARTNER'],
};

export const getOrganization: ToolDefinition = {
    name: 'get_organization',
    description: 'Get details of a specific organization by short code',
    category: 'Organizations',
    inputSchema: z.object({
        organizationCode: z.string().describe('The organization short code'),
    }),
    graphqlQuery: `
    query GetOrganization($input: FilteredPartnerOrganizationsInput!) {
      filteredPartnerOrganizations(input: $input) {
        organizations {
          node {
            organization {
              id
              name
              organizationCode
            }
            totals {
              numberOfMembers
            }
          }
        }
      }
    }
  `,
    resultPath: 'filteredPartnerOrganizations',
    orgScoped: true,
};

// Organization Members - using Manager API schema
// PartnerOrganizationMembersResultNode has: uid, name (PersonName), externalUserId, employeeId, disabled, kycStatus, employmentStatus, currentHsaAccountBalance, benefitOfferingEnrollments
export const listOrganizationMembers: ToolDefinition = {
    name: 'list_organization_members',
    description: 'List members of a specific organization',
    category: 'Organizations',
    inputSchema: z.object({
        organizationCode: z.string().describe('The organization short code'),
        memberName: z.string().optional().describe('Filter by member name'),
        filterByDisabledStatus: z.boolean().optional().describe('Filter by disabled status'),
        filterByEmploymentStatus: z
            .string()
            .optional()
            .describe('Filter by employment status (EMPLOYED or NOT_EMPLOYED)'),
        first: z.number().optional().describe('Number of results to return'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query ListOrganizationMembers($input: FilteredPartnerOrganizationMembersInput!) {
      filteredPartnerOrganizationMembers(input: $input) {
        pageInfo {
          hasNextPage
          endCursor
        }
        members {
          cursor
          node {
            uid
            name {
              firstName
              lastName
            }
            externalUserId
            employeeId
            disabled
            kycStatus
            employmentStatus
            currentHsaAccountBalance
            benefitOfferingEnrollments {
              name
              enrollmentActive
              accountType
              accountBalance {
                amount
                currency
              }
            }
          }
        }
      }
    }
  `,
    resultPath: 'filteredPartnerOrganizationMembers',
    orgScoped: true,
};

// Users/Individuals - using Manager API schema (filteredPartnerUsers and partnerUserDetails)
// FilteredPartnerUsersInput has: uid, externalUserId, employeeId, name, kycStatus, page, orderBy, organizationCodes
// PartnerUserSearchResultNode has: uid, personName (PersonName), employeeId, externalUserId, enrollmentDate, dateOfBirth, maskedSSN, kycVerificationResult, organizationMemberships
export const listUsers: ToolDefinition = {
    name: 'list_users',
    description: 'List users/members for the authenticated partner',
    category: 'Users',
    inputSchema: z.object({
        organizationCodes: z.array(z.string()).optional().describe('Filter by organization short codes'),
        name: z.string().optional().describe('Search by user name'),
        uid: z.string().optional().describe('Search by specific user UID'),
        externalUserId: z.string().optional().describe('Search by external user ID'),
        employeeId: z.string().optional().describe('Search by employee ID'),
        kycStatus: z
            .array(z.string())
            .optional()
            .describe('Filter by KYC status (e.g., VERIFIED, PENDING, NEEDS_REVIEW, REJECTED)'),
        first: z.number().optional().describe('Number of results to return'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query ListUsers($input: FilteredPartnerUsersInput!) {
      filteredPartnerUsers(input: $input) {
        pageInfo {
          hasNextPage
          endCursor
        }
        userResults {
          cursor
          node {
            uid
            personName {
              firstName
              lastName
            }
            employeeId
            externalUserId
            enrollmentDate
            dateOfBirth
            maskedSSN
            kycVerificationResult {
              status
            }
            organizationMemberships {
              organizationCode
              organizationName
            }
          }
        }
      }
    }
  `,
    resultPath: 'filteredPartnerUsers',
    orgScoped: true,
};

// PartnerUserDetails has: uid, profile (UserProfile), email, disabled, organizationMemberships, userDetailsAreEditableForKYC
// UserProfile has: name (PersonName), birthday, contactInfo (ContactInfo), homeAddress, mailingAddress, tin, uid
// ContactInfo has: mobilePhone, mobilePhoneCountryCode, mobilePhoneVerified (no email field)
// OrganizationMembershipResultNode has: organizationCode, organizationName, organizationPublicUlid, roles
export const getUserDetails: ToolDefinition = {
    name: 'get_user_details',
    description: 'Get detailed information about a specific user by UID',
    category: 'Users',
    inputSchema: z.object({
        uid: z.string().describe('The user UID'),
        includeInactiveOrganizationMemberships: z
            .boolean()
            .optional()
            .describe('Include inactive organization memberships'),
    }),
    graphqlQuery: `
    query GetUserDetails($input: PartnerUserDetailsInput!) {
      partnerUserDetails(input: $input) {
        uid
        disabled
        userDetailsAreEditableForKYC
        profile {
          name {
            firstName
            middleName
            lastName
          }
          birthday
          homeAddress {
            addressLine1
            addressLine2
            city
            state
            zip
          }
          mailingAddress {
            addressLine1
            addressLine2
            city
            state
            zip
          }
          contactInfo {
            mobilePhone
            mobilePhoneCountryCode
          }
        }
        email {
          address
        }
        organizationMemberships {
          memberships {
            cursor
            node {
              organizationCode
              organizationName
              organizationPublicUlid
              roles
            }
          }
        }
      }
    }
  `,
    resultPath: 'partnerUserDetails',
};

// Benefits Programs - using Manager API schema
// Query: partnerOrganizationBenefitsPrograms returns BenefitsPrograms
// BenefitsPrograms has: pageInfo, programs (array of BenefitsProgramNode)
// BenefitsProgramNode has: cursor, node (BenefitsProgram)
// BenefitsProgram has: id, offerings (array of BenefitsOfferingNode), pageInfo
// BenefitsOfferingNode has: cursor, node (BenefitsOffering)
// BenefitsOffering has: id, name, description, type (accountType), status, startDate, endDate
export const listBenefitsPrograms: ToolDefinition = {
    name: 'list_benefits_programs',
    description: 'List benefits programs for an organization',
    category: 'Benefits',
    inputSchema: z.object({
        organizationCode: z.string().describe('The organization short code'),
        first: z.number().optional().describe('Number of results to return'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query ListBenefitsPrograms($input: PartnerOrganizationBenefitsProgramsInput!) {
      partnerOrganizationBenefitsPrograms(input: $input) {
        pageInfo {
          hasNextPage
          endCursor
        }
        programs {
          cursor
          node {
            id
            offerings {
              cursor
              node {
                id
                name
                description
                type
                status
                startDate
                endDate
              }
            }
          }
        }
      }
    }
  `,
    resultPath: 'partnerOrganizationBenefitsPrograms',
    orgScoped: true,
};

// Offering Templates - using Manager API schema
// BenefitsOfferingTemplates has: pageInfo, templates (array of BenefitsOfferingTemplateNode)
// BenefitsOfferingTemplateNode has: cursor, node (BenefitsOfferingTemplate)
// BenefitsOfferingTemplate has: id, name, description, type (accountType), substantiationRequirement, fundingStrategy
export const listOfferingTemplates: ToolDefinition = {
    name: 'list_offering_templates',
    description: 'List available offering templates for a partner',
    category: 'Benefits',
    inputSchema: z.object({
        partnerCode: z.string().describe('The partner short code'),
        first: z.number().optional().describe('Number of results to return'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query ListOfferingTemplates($input: PartnerOfferingTemplatesInput!) {
      partnerOfferingTemplates(input: $input) {
        pageInfo {
          hasNextPage
          endCursor
        }
        templates {
          cursor
          node {
            id
            name
            description
            type
            substantiationRequirement
            fundingStrategy
          }
        }
      }
    }
  `,
    resultPath: 'partnerOfferingTemplates',
    allowedAdminTypes: ['PARTNER'],
};

// Claims - using Manager API schema
// ClaimForReimbursementAdministrativeView has: id, amount, amountForDisplay, status, dateOfClaimSubmission, dateOfClaimTransaction, merchant, organizationName, user
export const listClaims: ToolDefinition = {
    name: 'list_claims',
    description: 'List claims for reimbursement',
    category: 'Claims',
    inputSchema: z.object({
        organizationCodes: z.array(z.string()).optional().describe('Filter by organization short codes'),
        partnerCodes: z.array(z.string()).optional().describe('Filter by partner codes'),
        statuses: z
            .array(z.string())
            .optional()
            .describe('Filter by claim statuses (e.g., PENDING, IN_REVIEW, APPROVED, DENIED)'),
        userIds: z.array(z.string()).optional().describe('Filter by user UIDs'),
        userFullName: z.string().optional().describe('Filter by user full name'),
        offeringTypes: z
            .array(z.string())
            .optional()
            .describe('Filter by offering types (e.g., HSA, FSA, LSA, DCFSA, HRA)'),
        startDate: z.string().optional().describe('Start date (YYYY-MM-DD format)'),
        endDate: z.string().optional().describe('End date (YYYY-MM-DD format)'),
        first: z.number().optional().describe('Number of results to return'),
        after: z.string().optional().describe('Cursor for pagination'),
    }),
    graphqlQuery: `
    query ListClaims($input: PartnerListClaimsForReimbursementInput!) {
      partnerListClaimsForReimbursement(input: $input) {
        pageInfo {
          hasNextPage
          endCursor
        }
        totalCount
        claims {
          id
          status
          dateOfClaimSubmission
          dateOfClaimTransaction
          amount
          amountForDisplay
          merchant
          organizationName
        }
      }
    }
  `,
    resultPath: 'partnerListClaimsForReimbursement',
    orgScoped: true,
};

// Current Partner - using Manager API schema
// Partner has: shortCode, name
export const getCurrentPartner: ToolDefinition = {
    name: 'get_current_partner',
    description: 'Get details about the current partner context',
    category: 'Partner',
    inputSchema: z.object({}),
    graphqlQuery: `
    query GetCurrentPartner {
      currentPartner {
        shortCode
        name
      }
    }
  `,
    resultPath: 'currentPartner',
    allowedAdminTypes: ['PARTNER'],
};

// Current Administrator Details - using Manager API schema
// currentAdministratorDetailsPayload has: administeredEntity, currentAdministratorProfile
// AdministeredEntity has: name, id, code, partnerCode, administeredEntityType
// AdministratorProfile has: name (PersonName), mobilePhoneContactInfo
export const getCurrentAdministrator: ToolDefinition = {
    name: 'get_current_administrator',
    description: 'Get details about the current logged-in administrator',
    category: 'Administrator',
    inputSchema: z.object({}),
    graphqlQuery: `
    query GetCurrentAdministrator {
      currentAdministratorDetails {
        administeredEntity {
          name
          id
          code
          partnerCode
          administeredEntityType
        }
        currentAdministratorProfile {
          name {
            firstName
            lastName
          }
        }
      }
    }
  `,
    resultPath: 'currentAdministratorDetails',
};

// Create or Return Root Benefits Program - using Manager API schema
// partnerCreateOrReturnRootBenefitsProgram creates or returns the root benefits program for an organization
export const createOrReturnRootBenefitsProgram: ToolDefinition = {
    name: 'create_or_return_root_benefits_program',
    description: 'Create or return the root benefits program for an organization. If a program already exists, it returns the existing one.',
    category: 'Benefits',
    inputSchema: z.object({
        organizationCode: z.string().describe('The organization short code'),
    }),
    graphqlQuery: `
    mutation CreateOrReturnRootBenefitsProgram($input: PartnerCreateOrReturnRootBenefitsProgramInput!) {
      partnerCreateOrReturnRootBenefitsProgram(input: $input) {
        program {
          id
          offerings {
            cursor
            node {
              id
              name
              type
              status
              startDate
              endDate
            }
          }
        }
      }
    }
  `,
    resultPath: 'partnerCreateOrReturnRootBenefitsProgram',
    allowedAdminTypes: ['PARTNER'],
};

// Create Benefits Offering - using Manager API schema
// partnerCreateBenefitsOffering creates a new benefits offering within a program
export const createBenefitsOffering: ToolDefinition = {
    name: 'create_benefits_offering',
    description: 'Create a new benefits offering within a benefits program for an organization',
    category: 'Benefits',
    inputSchema: z.object({
        benefitsProgramId: z.string().describe('The public ID of the benefits program'),
        templateId: z.string().describe('The public ID of the offering template to use'),
        name: z.string().describe('The user-displayable name for the offering'),
        description: z.string().describe('A description of the offering'),
        startDate: z.string().describe('The start date (YYYY-MM-DD format)'),
        endDate: z.string().optional().describe('The end date (YYYY-MM-DD format, optional)'),
        internalName: z.string().optional().describe('Internal name for the offering (optional)'),
    }),
    graphqlQuery: `
    mutation CreateBenefitsOffering($input: CreateBenefitsOfferingInput!) {
      partnerCreateBenefitsOffering(input: $input) {
        offering {
          id
          name
          description
          type
          status
          startDate
          endDate
        }
        program {
          id
        }
      }
    }
  `,
    resultPath: 'partnerCreateBenefitsOffering',
    allowedAdminTypes: ['PARTNER'],
};

// Bulk Create Individuals - using Manager API schema
// bulkCreateIndividuals creates multiple individuals in an organization
export const bulkCreateIndividuals: ToolDefinition = {
    name: 'bulk_create_individuals',
    description: 'Create multiple individuals (members) in an organization',
    category: 'Users',
    inputSchema: z.object({
        organizationUlid: z.string().describe('The public ULID of the organization'),
        individuals: z
            .array(
                z.object({
                    email: z.string().describe('The individual email address (required)'),
                    name: z
                        .object({
                            firstName: z.string().describe('First name'),
                            lastName: z.string().describe('Last name'),
                            middleName: z.string().optional().describe('Middle name (optional)'),
                        })
                        .describe('The individual name'),
                    dateOfBirth: z.string().optional().describe('Date of birth (YYYY-MM-DD format)'),
                    phoneNumber: z.string().optional().describe('Phone number'),
                    tin: z.string().optional().describe('Tax Identification Number (SSN)'),
                    externalUserId: z.string().optional().describe('External user ID from your system'),
                    language: z.string().optional().describe('Language preference (e.g., en, es)'),
                    address: z
                        .object({
                            addressLine1: z.string().describe('Street address line 1'),
                            addressLine2: z.string().optional().describe('Street address line 2'),
                            city: z.string().describe('City'),
                            state: z.string().describe('State code (e.g., CA, NY)'),
                            zip: z.string().describe('ZIP code'),
                            country: z.string().optional().describe('Country code (default: US)'),
                        })
                        .optional()
                        .describe('Primary address'),
                    mailingAddress: z
                        .object({
                            addressLine1: z.string().describe('Street address line 1'),
                            addressLine2: z.string().optional().describe('Street address line 2'),
                            city: z.string().describe('City'),
                            state: z.string().describe('State code (e.g., CA, NY)'),
                            zip: z.string().describe('ZIP code'),
                            country: z.string().optional().describe('Country code (default: US)'),
                        })
                        .optional()
                        .describe('Mailing address (if different from primary)'),
                }),
            )
            .describe('Array of individuals to create'),
    }),
    graphqlQuery: `
    mutation BulkCreateIndividuals($input: BulkCreateIndividualsInput!) {
      bulkCreateIndividuals(input: $input) {
        ... on BulkCreateIndividualsSuccess {
          success
          uid
        }
        ... on BulkCreateIndividualsFailure {
          success
          message
        }
      }
    }
  `,
    resultPath: 'bulkCreateIndividuals',
    orgScoped: true,
};

// Bulk Enroll in Offerings - using Manager API schema
// bulkEnrollInOfferings enrolls individuals in benefit offerings
export const bulkEnrollInOfferings: ToolDefinition = {
    name: 'bulk_enroll_in_offerings',
    description: 'Enroll one or more individuals in benefit offerings',
    category: 'Enrollments',
    inputSchema: z.object({
        enrollments: z
            .array(
                z.object({
                    externalUserId: z.string().describe('External user ID of the individual to enroll'),
                    offeringId: z.string().describe('The public ID of the offering to enroll in'),
                    enrollmentStartDate: z.string().optional().describe('Enrollment start date (ISO datetime)'),
                    enrollmentEndDate: z.string().optional().describe('Enrollment end date (ISO datetime)'),
                    coverageType: z
                        .enum(['INDIVIDUAL', 'FAMILY', 'NONE'])
                        .optional()
                        .describe('Health insurance coverage type for HSA limits'),
                    employeeInitialContributionAmount: z
                        .string()
                        .optional()
                        .describe('Initial contribution from employee (in cents as string)'),
                    employerInitialContributionAmount: z
                        .string()
                        .optional()
                        .describe('Initial contribution from employer (in cents as string)'),
                    employeeRecurringContributionAmount: z
                        .string()
                        .optional()
                        .describe('Recurring contribution from employee (in cents as string)'),
                    employerRecurringContributionAmount: z
                        .string()
                        .optional()
                        .describe('Recurring contribution from employer (in cents as string)'),
                    employeeName: z
                        .object({
                            firstName: z.string().describe('First name'),
                            lastName: z.string().describe('Last name'),
                            middleName: z.string().optional().describe('Middle name'),
                        })
                        .optional()
                        .describe('Employee name (optional, for display)'),
                }),
            )
            .describe('Array of enrollment requests'),
    }),
    graphqlQuery: `
    mutation BulkEnrollInOfferings($input: [EnrollmentRequestInput!]!) {
      bulkEnrollInOfferings(input: $input) {
        externalUserId
        success
        message
      }
    }
  `,
    resultPath: 'bulkEnrollInOfferings',
};

// Unenroll Participant from Offerings - using Manager API schema
// unenrollParticipantFromOfferings removes a participant from offerings
export const unenrollParticipantFromOfferings: ToolDefinition = {
    name: 'unenroll_participant_from_offerings',
    description: 'Unenroll a participant from one or more benefit offerings',
    category: 'Enrollments',
    inputSchema: z.object({
        participantUid: z.string().describe('The UID of the participant to unenroll'),
        offeringIds: z.array(z.string()).describe('Array of offering IDs to unenroll from'),
        effectiveAt: z.string().optional().describe('Effective date/time for unenrollment (ISO datetime)'),
        sendEmailConfirmation: z.boolean().optional().describe('Whether to send email confirmation to admin'),
    }),
    graphqlQuery: `
    mutation UnenrollParticipantFromOfferings($input: ParticipantUnenrollmentsInput!) {
      unenrollParticipantFromOfferings(input: $input) {
        participantUid
        externalUserId
        success
        message
      }
    }
  `,
    resultPath: 'unenrollParticipantFromOfferings',
};

// All tools registry
export const tools: ToolDefinition[] = [
    // Organizations
    listOrganizations,
    getOrganization,
    listOrganizationMembers,
    // Users
    listUsers,
    getUserDetails,
    bulkCreateIndividuals,
    // Benefits
    listBenefitsPrograms,
    listOfferingTemplates,
    createOrReturnRootBenefitsProgram,
    createBenefitsOffering,
    // Enrollments
    bulkEnrollInOfferings,
    unenrollParticipantFromOfferings,
    // Claims
    listClaims,
    // Partner/Administrator
    getCurrentPartner,
    getCurrentAdministrator,
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

/**
 * Filter tools based on admin type
 * @param adminType - The type of administrator (PARTNER or ORGANIZATION)
 * @returns Tools that the admin type can access
 */
export function getToolsForAdminType(adminType: AdministeredEntityType): ToolDefinition[] {
    return tools.filter((tool) => {
        // If no restrictions, all admin types can access
        if (!tool.allowedAdminTypes) return true;
        // Otherwise, check if the admin type is in the allowed list
        return tool.allowedAdminTypes.includes(adminType);
    });
}

/**
 * Get tools grouped by category, filtered by admin type
 * @param adminType - The type of administrator (PARTNER or ORGANIZATION)
 * @returns Tools grouped by category that the admin type can access
 */
export function getToolsByCategoryForAdminType(
    adminType: AdministeredEntityType,
): Record<string, ToolDefinition[]> {
    const filteredTools = getToolsForAdminType(adminType);
    return filteredTools.reduce(
        (acc, tool) => {
            if (!acc[tool.category]) {
                acc[tool.category] = [];
            }
            acc[tool.category].push(tool);
            return acc;
        },
        {} as Record<string, ToolDefinition[]>,
    );
}
