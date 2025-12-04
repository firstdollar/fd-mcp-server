import { z } from 'zod';

export interface ToolDefinition {
    name: string;
    description: string;
    category: string;
    inputSchema: z.ZodObject<z.ZodRawShape>;
    graphqlQuery: string;
    resultPath: string;
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

// All tools registry
export const tools: ToolDefinition[] = [
    // Organizations
    listOrganizations,
    getOrganization,
    listOrganizationMembers,
    // Users
    listUsers,
    getUserDetails,
    // Benefits
    listBenefitsPrograms,
    listOfferingTemplates,
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
