'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './auth-context';
import { createApiClient } from './api-client';
import type { AdministeredEntityType } from './tools/definitions';

export interface AdministeredEntity {
    name: string;
    id: string;
    code: string;
    partnerCode: string;
    administeredEntityType: AdministeredEntityType;
}

export interface AdminProfile {
    name: {
        firstName: string;
        lastName: string;
    };
}

export interface AdminDetails {
    administeredEntity: AdministeredEntity;
    currentAdministratorProfile: AdminProfile;
}

interface AdminContextType {
    /** The admin details (null while loading or if not authenticated) */
    adminDetails: AdminDetails | null;
    /** Whether the admin details are currently loading */
    loading: boolean;
    /** Any error that occurred while fetching admin details */
    error: string | null;
    /** Refresh the admin details */
    refresh: () => Promise<void>;
    /** Helper: is this a partner admin? */
    isPartnerAdmin: boolean;
    /** Helper: is this an organization admin? */
    isOrgAdmin: boolean;
    /** Helper: get the organization code (for org admins) */
    organizationCode: string | null;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
    const { user, getIdToken } = useAuth();
    const [adminDetails, setAdminDetails] = useState<AdminDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAdminDetails = async () => {
        if (!user) {
            setAdminDetails(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const token = await getIdToken();
            if (!token) {
                throw new Error('Failed to get authentication token');
            }

            const client = createApiClient(token);
            const data = await client.executeTool('get_current_administrator', {});

            setAdminDetails(data as AdminDetails);
        } catch (err) {
            console.error('Failed to fetch admin details:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch admin details');
            setAdminDetails(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAdminDetails();
    }, [user]);

    const isPartnerAdmin = adminDetails?.administeredEntity?.administeredEntityType === 'PARTNER';
    const isOrgAdmin = adminDetails?.administeredEntity?.administeredEntityType === 'ORGANIZATION';
    const organizationCode = isOrgAdmin ? adminDetails?.administeredEntity?.code ?? null : null;

    return (
        <AdminContext.Provider
            value={{
                adminDetails,
                loading,
                error,
                refresh: fetchAdminDetails,
                isPartnerAdmin,
                isOrgAdmin,
                organizationCode,
            }}
        >
            {children}
        </AdminContext.Provider>
    );
}

export function useAdmin() {
    const context = useContext(AdminContext);
    if (context === undefined) {
        throw new Error('useAdmin must be used within an AdminProvider');
    }
    return context;
}
