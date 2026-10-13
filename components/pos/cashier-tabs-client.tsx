"use client";

import { PosTerminal } from "@/components/pos-terminal";

interface CashierTabsClientProps {
  branchCode?: string | null;
  canEdit?: boolean;
  role: string;
  currentUser?: {
    name: string;
    email: string;
    staffId: string;
    role: string;
  };
  counters?: any[];
  staffList?: any[];
  maxAllowedCounters?: number;
  planName?: string;
}

export function CashierTabsClient({
  branchCode,
  canEdit = true,
  role,
  currentUser,
}: CashierTabsClientProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PosTerminal
        branchCode={branchCode}
        canEdit={canEdit}
        currentUser={currentUser}
      />
    </div>
  );
}
