"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";

export async function getAuditLogs() {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager", "auditor"]);
  
  let query: FirebaseFirestore.Query = adminDb.collection("admin_audit_logs").orderBy("timestamp", "desc").limit(500);
  
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snap = await query.get();
  return snap.docs.map(doc => {
    const data = doc.data();
    let action = data.action || data.actionType || "UNKNOWN";
    let severity = data.severity || (action.startsWith("FRAUD") ? "CRITICAL" : action.includes("SUSPEND") ? "WARNING" : "INFO");
    
    if (action.includes("LOCKED") || action.includes("SUSPEND")) severity = "WARNING";
    if (action.includes("REVOKE") || action.includes("DELETE") || action.includes("REMOVE")) severity = "CRITICAL";

    return {
      id: doc.id,
      action,
      actor: data.actor || data.actorEmail || "SYSTEM",
      target: data.companyName || data.targetCollection || data.targetId || data.tenantId || "",
      details: data.details || data.branchCode || "",
      severity,
      timestamp: data.timestamp?.toDate().toISOString() || new Date().toISOString()
    };
  });
}