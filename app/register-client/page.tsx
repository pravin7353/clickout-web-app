import { requireRole } from "@/lib/rbac";
import { RegisterClientForm } from "@/components/register-client-form";
import { PageHeader } from "@/components/ui";

export default async function RegisterClientPage() {
  await requireRole(["super_admin", "tenant_admin"]);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto", display: "grid", gap: 20 }}>
      <PageHeader
        title="Client Onboarding Portal"
        subtitle="Provision enterprise retail tenants, configure payment rails, and deploy initial store godown locations."
      />
      <RegisterClientForm />
    </div>
  );
}