'use client';

import { useAuth } from '@/lib/auth-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, Loader2 } from 'lucide-react';

/**
 * Partner selector component for FD Admins.
 * Allows FD Admins to switch between different partners.
 * For Partner Admins, shows their partner as read-only.
 */
export function PartnerSelector() {
  const {
    isFdAdmin,
    availablePartners,
    selectedPartner,
    setSelectedPartner,
    loadingPartners,
    partnerCode,
  } = useAuth();

  // Show loading state
  if (loadingPartners) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading partners...</span>
      </div>
    );
  }

  // Don't show if no partners available
  if (availablePartners.length === 0) {
    return null;
  }

  // For Partner Admins, show their partner as read-only
  if (!isFdAdmin) {
    const partner = availablePartners[0];
    return (
      <div className="flex items-center gap-2 text-sm">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{partner?.name || partnerCode}</span>
      </div>
    );
  }

  // For FD Admins, show a dropdown to select partner
  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={selectedPartner || ''} onValueChange={setSelectedPartner}>
        <SelectTrigger className="w-[200px] h-8">
          <SelectValue placeholder="Select a partner" />
        </SelectTrigger>
        <SelectContent>
          {availablePartners.map((partner) => (
            <SelectItem key={partner.shortCode} value={partner.shortCode}>
              {partner.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
