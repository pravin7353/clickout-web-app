import { redirect } from "next/navigation";

export default async function PosBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { store } = await searchParams;
  redirect(store ? `/cashier?store=${store}` : "/cashier");
}
