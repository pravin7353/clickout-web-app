"use client";

import { useState, useTransition } from "react";
import { LedgerAccountDocument, AccountType, BalanceType } from "@/lib/schemas/finance-schema";
import { FinanceVoucherForm } from "@/components/finance-voucher-form";
import { FinanceLedgerView } from "@/components/finance-ledger-view";
import { createLedgerAccountAction, getLedgerAccountsAction } from "@/actions/finance";

interface FinanceDashboardClientProps {
  initialAccounts: LedgerAccountDocument[];
  tenantId?: string | null;
  userRole: string;
}

export function FinanceDashboardClient({
  initialAccounts,
  tenantId,
  userRole,
}: FinanceDashboardClientProps) {
  const [accounts, setAccounts] = useState<LedgerAccountDocument[]>(initialAccounts);
  const [activeTab, setActiveTab] = useState<"vouchers" | "ledger" | "accounts">("vouchers");

  // New Account Modal State
  const [showAddAccountModal, setShowAddAccountModal] = useState<boolean>(false);
  const [newAccName, setNewAccName] = useState<string>("");
  const [newAccType, setNewAccType] = useState<AccountType>("EXPENSE");
  const [newAccGroup, setNewAccGroup] = useState<string>("Indirect Expenses");
  const [newOpeningBal, setNewOpeningBal] = useState<string>("0");
  const [newOpeningBalType, setNewOpeningBalType] = useState<BalanceType>("DR");
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const reloadAccounts = async () => {
    const res = await getLedgerAccountsAction();
    if (res.ok && res.accounts) {
      setAccounts(res.accounts);
    }
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setModalSuccess(null);

    const cleanName = newAccName.trim();
    if (!cleanName) {
      setModalError("Account name is required.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await createLedgerAccountAction({
          accountName: cleanName,
          accountType: newAccType,
          accountGroup: newAccGroup.trim() || "General",
          openingBalance: parseFloat(newOpeningBal) || 0,
          openingBalanceType: newOpeningBalType,
        });

        if (res.ok) {
          setModalSuccess(`Account '${res.account.accountName}' created successfully!`);
          await reloadAccounts();
          setTimeout(() => {
            setShowAddAccountModal(false);
            setModalSuccess(null);
            setNewAccName("");
            setNewOpeningBal("0");
          }, 1200);
        } else {
          setModalError(res.error || "Failed to create account.");
        }
      } catch (err: any) {
        setModalError(err.message || "Failed to create ledger account.");
      }
    });
  };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1250, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>
            Finance & General Ledger
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 6, marginBottom: 0 }}>
            CA-suitable double-entry accounting, real-time voucher postings, and Tally-style ledger registers
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddAccountModal(true)}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            background: "var(--cta-bg)",
            color: "var(--cta-text)",
            fontWeight: 800,
            fontSize: 13,
            border: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 2px 10px rgba(59, 130, 246, 0.3)",
          }}
        >
          <span>➕</span> New Ledger Account
        </button>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: 10, borderBottom: "1px solid var(--border)", paddingBottom: 12, overflowX: "auto" }}>
        <button
          type="button"
          onClick={() => setActiveTab("vouchers")}
          style={{
            padding: "8px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "vouchers" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "vouchers" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "vouchers" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>✍️</span> Double-Entry Voucher
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ledger")}
          style={{
            padding: "8px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "ledger" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "ledger" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "ledger" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>📖</span> Account Ledger (Tally View)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("accounts")}
          style={{
            padding: "8px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "accounts" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "accounts" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "accounts" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>🗂️</span> Chart of Accounts ({accounts.length})
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "vouchers" && (
        <FinanceVoucherForm accounts={accounts} onVoucherCreated={reloadAccounts} />
      )}

      {activeTab === "ledger" && (
        <FinanceLedgerView accounts={accounts} />
      )}

      {activeTab === "accounts" && (
        <div
          style={{
            background: "var(--card-bg)",
            borderRadius: 18,
            border: "1px solid var(--border)",
            overflow: "hidden",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
              General Chart of Accounts ({accounts.length})
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              System accounts are protected from accidental deletion
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>ACCOUNT NAME</th>
                  <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>PRIMARY TYPE</th>
                  <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>GROUP</th>
                  <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>OPENING BALANCE</th>
                  <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>SYSTEM ACCOUNT</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <td style={{ padding: "14px 16px", fontWeight: 800, color: "var(--text-primary)" }}>
                      {acc.accountName}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 6,
                          background:
                            acc.accountType === "ASSET"
                              ? "rgba(59, 130, 246, 0.1)"
                              : acc.accountType === "INCOME"
                              ? "rgba(34, 197, 94, 0.1)"
                              : acc.accountType === "LIABILITY"
                              ? "rgba(245, 158, 11, 0.1)"
                              : "rgba(239, 68, 68, 0.1)",
                          color:
                            acc.accountType === "ASSET"
                              ? "#3b82f6"
                              : acc.accountType === "INCOME"
                              ? "#22c55e"
                              : acc.accountType === "LIABILITY"
                              ? "#f59e0b"
                              : "#ef4444",
                          fontWeight: 800,
                          fontSize: 11,
                        }}
                      >
                        {acc.accountType}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>
                      {acc.accountGroup}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text-primary)" }}>
                      ₹{acc.openingBalance.toFixed(2)} {acc.openingBalanceType}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {acc.isSystemAccount ? (
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>🔒 Core System</span>
                      ) : (
                        <span style={{ fontSize: 12, color: "#3b82f6" }}>Custom</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ➕ Modal: Add New Custom Ledger Account */}
      {showAddAccountModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              width: 500,
              maxWidth: "100%",
              background: "var(--card-bg)",
              borderRadius: 20,
              border: "1px solid var(--border)",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                Add New Ledger Account
              </h3>
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontSize: 13 }}>
                ⚠️ {modalError}
              </div>
            )}

            {modalSuccess && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(34, 197, 94, 0.15)", color: "#22c55e", fontSize: 13 }}>
                ✅ {modalSuccess}
              </div>
            )}

            <form onSubmit={handleCreateAccount} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  ACCOUNT NAME
                </label>
                <input
                  type="text"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="e.g. Electricity Expense, Rent Deposit"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    PRIMARY TYPE
                  </label>
                  <select
                    value={newAccType}
                    onChange={(e) => setNewAccType(e.target.value as AccountType)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                    }}
                  >
                    <option value="ASSET">ASSET (Asset)</option>
                    <option value="LIABILITY">LIABILITY (Liability)</option>
                    <option value="EQUITY">EQUITY (Capital/Equity)</option>
                    <option value="INCOME">INCOME (Revenue)</option>
                    <option value="EXPENSE">EXPENSE (Expense)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    GROUP
                  </label>
                  <input
                    type="text"
                    value={newAccGroup}
                    onChange={(e) => setNewAccGroup(e.target.value)}
                    placeholder="e.g. Indirect Expenses"
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    OPENING BALANCE (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newOpeningBal}
                    onChange={(e) => setNewOpeningBal(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    BALANCE TYPE
                  </label>
                  <select
                    value={newOpeningBalType}
                    onChange={(e) => setNewOpeningBalType(e.target.value as BalanceType)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                    }}
                  >
                    <option value="DR">Debit (Dr)</option>
                    <option value="CR">Credit (Cr)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 10,
                    border: "none",
                    background: "var(--cta-bg)",
                    color: "var(--cta-text)",
                    fontWeight: 800,
                    cursor: isPending ? "not-allowed" : "pointer",
                  }}
                >
                  {isPending ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
