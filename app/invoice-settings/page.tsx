import { getInvoiceRules } from "@/actions/invoice-rules";
import { InvoiceRulesForm } from "@/components/invoice-rules-form";

export default async function InvoiceSettingsPage() {
  const rules = await getInvoiceRules();
  return <InvoiceRulesForm initialRules={rules} />;
}