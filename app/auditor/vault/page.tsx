import { getAuditLogs } from "@/actions/audit-logs";
import { AuditTerminal } from "@/app/auditor/terminal/page";

export default async function AuditVaultPage() {
  const logs = await getAuditLogs();
  return <AuditTerminal initialLogs={logs} />;
}