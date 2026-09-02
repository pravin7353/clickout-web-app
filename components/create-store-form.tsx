"use client";

import { useState, useTransition, useRef } from "react";
import { createStore } from "@/actions/store";
import { useRouter } from "next/navigation";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", 
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", 
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", 
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu & Kashmir", "Chandigarh", "Other"
];

const LICENSE_TYPES = ["GSTIN", "FSSAI", "Drug License", "Liquor License", "Trade License", "Fire NOC", "Other"];

export function CreateStoreForm({ asIcon = false }: { asIcon?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // API loading states
  const [fetchingPincode, setFetchingPincode] = useState(false);
  const [fetchingIfscFor, setFetchingIfscFor] = useState<number | null>(null);
  const [showPrefillModal, setShowPrefillModal] = useState(false);
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [data, setData] = useState({
    storeName: "", branchCode: "", storePhone: "",
    managerEmpId: "", managerName: "", managerPhone: "", managerEmail: "",
    pincode: "", city: "", state: "", address: "",
    licenses: [] as { type: string; number: string }[],
    bankAccounts: [] as { label: string; accountName: string; accountNo: string; ifsc: string; bankName: string; upi: string }[]
  });

  const updateData = (fields: Partial<typeof data>) => setData(prev => ({ ...prev, ...fields }));

  const handlePincode = (val: string) => {
    updateData({ pincode: val });
    if (val.length !== 6) return;
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setFetchingPincode(true);
    
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${val}`);
        const json = await res.json();
        if (json[0].Status === "Success") {
          const po = json[0].PostOffice[0];
          updateData({ city: po.District || po.Block, state: INDIAN_STATES.includes(po.State) ? po.State : "Other" });
        }
      } catch (e) {
        console.error("Pincode fetch failed", e);
      }
      setFetchingPincode(false);
    }, 400);
  };

  const handleIfsc = (val: string, index: number) => {
    const newBanks = [...data.bankAccounts];
    newBanks[index].ifsc = val.toUpperCase();
    updateData({ bankAccounts: newBanks });
    
    if (val.length !== 11) return;
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setFetchingIfscFor(index);
    
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://ifsc.razorpay.com/${val.toUpperCase()}`);
        if (res.ok) {
          const json = await res.json();
          const banks = [...data.bankAccounts];
          banks[index].bankName = `${json.BANK} (${json.BRANCH})`;
          updateData({ bankAccounts: banks });
        }
      } catch (e) {
        console.error("IFSC fetch failed", e);
      }
      setFetchingIfscFor(null);
    }, 400);
  };

  const handlePrefill = () => {
    setShowPrefillModal(true);
  };

  const executePrefill = async () => {
    // TODO: Wire up to a server action `getLatestStoreForPrefill()`
    // For now, just close the modal
    setShowPrefillModal(false);
  };

  const validateStep = () => {
    setError("");
    if (step === 1) {
      if (!data.storeName.trim()) return "Store Name is required.";
      if (!data.branchCode.trim()) return "Branch Code is required.";
      if (data.managerEmail || data.managerName || data.managerPhone) {
        if (!data.managerEmail) return "Manager email is required if assigning a manager.";
        if (!data.managerName) return "Manager name is required.";
        if (!/^[6-9]\d{9}$/.test(data.managerPhone)) return "Valid 10-digit manager phone required.";
      }
    }
    if (step === 2) {
      if (!data.address.trim()) return "Address is required.";
      if (!data.city.trim()) return "City is required.";
      if (!data.state.trim()) return "State is required.";
      if (!/^\d{6}$/.test(data.pincode)) return "Valid 6-digit pincode required.";
    }
    return null;
  };

  const nextStep = () => {
    const err = validateStep();
    if (err) setError(err);
    else { setError(""); setStep(s => s + 1); }
  };

  const handleSubmit = () => {
    setError("");
    startTransition(async () => {
      const res = await createStore(data);
      if (!res.ok) setError(res.error ?? "Failed to create store.");
      else { 
        setOpen(false); 
        setStep(1); 
        setData({ storeName: "", branchCode: "", storePhone: "", managerEmpId: "", managerName: "", managerPhone: "", managerEmail: "", pincode: "", city: "", state: "", address: "", licenses: [], bankAccounts: [] });
        router.refresh(); 
      }
    });
  };

  if (!open) {
    if (asIcon) {
      return (
        <button 
          onClick={() => setOpen(true)} 
          title="Add New Store"
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "#A855F7" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      );
    }
    return <button onClick={() => setOpen(true)} className="co-btn co-btn-primary">+ Create Store</button>;
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div className="co-card" style={{ width: "100%", maxWidth: 600, maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", position: "relative" }}>
        
        {/* Custom Prefill Modal Overlay */}
        {showPrefillModal && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}>
            <div className="co-card" style={{ width: 340, padding: 24, textAlign: "center", border: "1px solid var(--border)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
              <div style={{ fontSize: 28, marginBottom: 16 }}>🔄</div>
              <h3 style={{ margin: "0 0 8px 0", fontSize: 16, color: "var(--text-primary)" }}>Prefill from previous store?</h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.5 }}>
                This will fetch Location, Licenses, and Banking details from your most recently created store.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <button type="button" onClick={() => setShowPrefillModal(false)} className="co-btn co-btn-ghost">Cancel</button>
                <button type="button" onClick={executePrefill} className="co-btn co-btn-primary">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "var(--scaffold-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Create New Store</h2>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>Step {step} of 4</p>
          </div>
          {step === 1 && (
            <button onClick={handlePrefill} className="co-btn co-btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }}>
              🔄 Same as previous store
            </button>
          )}
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {error && <div style={{ background: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)", padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16, border: "1px solid var(--danger)" }}>{error}</div>}

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Store Name *</label>
                  <input className="co-input" style={{ width: "100%" }} value={data.storeName} onChange={e => {
                    const val = e.target.value;
                    updateData({ storeName: val, branchCode: val.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() });
                  }} placeholder="e.g. ABC PVT LTD" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Branch Code *</label>
                  <input className="co-input" style={{ width: "100%" }} value={data.branchCode} onChange={e => updateData({ branchCode: e.target.value.toUpperCase() })} placeholder="e.g. ABC-001" />
                </div>
              </div>
              
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>Manager Assignment (Optional)</h4>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>Leave blank to manage this store yourself as Tenant Admin.</p>
                
                <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                  <input className="co-input" style={{ flex: 1 }} placeholder="Manager Name" value={data.managerName} onChange={e => updateData({ managerName: e.target.value })} />
                  <input className="co-input" style={{ flex: 1 }} placeholder="Employee ID (Optional)" value={data.managerEmpId} onChange={e => updateData({ managerEmpId: e.target.value })} />
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <input className="co-input" style={{ flex: 1 }} placeholder="Phone (10 digits)" maxLength={10} value={data.managerPhone} onChange={e => updateData({ managerPhone: e.target.value.replace(/\D/g, '') })} />
                  <input className="co-input" style={{ flex: 1 }} type="email" placeholder="Manager Email" value={data.managerEmail} onChange={e => updateData({ managerEmail: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Pincode *</label>
                  <input className="co-input" style={{ width: "100%" }} maxLength={6} value={data.pincode} onChange={e => handlePincode(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 400001" />
                  {fetchingPincode && <span style={{ position: "absolute", right: 12, top: 32, fontSize: 12 }}>⏳</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>City *</label>
                  <input className="co-input" style={{ width: "100%" }} value={data.city} onChange={e => updateData({ city: e.target.value })} placeholder="City" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>State *</label>
                <select className="co-input" style={{ width: "100%" }} value={data.state} onChange={e => updateData({ state: e.target.value })}>
                  <option value="">Select State</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Complete Address *</label>
                <textarea className="co-input" style={{ width: "100%", minHeight: 80, resize: "vertical" }} value={data.address} onChange={e => updateData({ address: e.target.value })} placeholder="Shop no, Building, Street..." />
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Add store-specific compliance details. (Max 5)</p>
              {data.licenses.map((lic, idx) => (
                <div key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <select className="co-input" style={{ flex: 1 }} value={lic.type} onChange={e => {
                    const newLics = [...data.licenses]; newLics[idx].type = e.target.value; updateData({ licenses: newLics });
                  }}>
                    {LICENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input className="co-input" style={{ flex: 2 }} placeholder="License Number" value={lic.number} onChange={e => {
                    const newLics = [...data.licenses]; newLics[idx].number = e.target.value.toUpperCase(); updateData({ licenses: newLics });
                  }} />
                  <button onClick={() => updateData({ licenses: data.licenses.filter((_, i) => i !== idx) })} className="co-btn-danger" style={{ padding: "10px 12px" }}>🗑️</button>
                </div>
              ))}
              {data.licenses.length < 5 && (
                <button type="button" onClick={() => updateData({ licenses: [...data.licenses, { type: "GSTIN", number: "" }] })} style={{ alignSelf: "flex-start", fontSize: 13, padding: "8px 16px", background: "linear-gradient(90deg, #F9A826 0%, #FFCC00 100%)", color: "#0A0A0A", fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer", boxShadow: "0 4px 12px rgba(249, 168, 38, 0.25)" }}>
                  ✦ Add License
                </button>
              )}
            </div>
          )}

          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Add settlement bank accounts. (Max 5)</p>
              {data.bankAccounts.map((bank, idx) => (
                <div key={idx} style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 8, position: "relative" }}>
                  <button onClick={() => updateData({ bankAccounts: data.bankAccounts.filter((_, i) => i !== idx) })} style={{ position: "absolute", top: 12, right: 12, background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer" }}>🗑️</button>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <input className="co-input" style={{ flex: 1 }} placeholder="Label (e.g. Primary)" value={bank.label} onChange={e => { const b = [...data.bankAccounts]; b[idx].label = e.target.value; updateData({ bankAccounts: b }); }} />
                    <input className="co-input" style={{ flex: 1 }} placeholder="Account Name" value={bank.accountName} onChange={e => { const b = [...data.bankAccounts]; b[idx].accountName = e.target.value; updateData({ bankAccounts: b }); }} />
                  </div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <input className="co-input" style={{ flex: 1 }} placeholder="Account No" value={bank.accountNo} onChange={e => { const b = [...data.bankAccounts]; b[idx].accountNo = e.target.value.replace(/\D/g, ''); updateData({ bankAccounts: b }); }} />
                    <div style={{ flex: 1, position: "relative" }}>
                      <input className="co-input" style={{ width: "100%" }} placeholder="IFSC Code" maxLength={11} value={bank.ifsc} onChange={e => handleIfsc(e.target.value, idx)} />
                      {fetchingIfscFor === idx && <span style={{ position: "absolute", right: 12, top: 10, fontSize: 12 }}>⏳</span>}
                    </div>
                  </div>
                  <input className="co-input" style={{ width: "100%", background: "var(--scaffold-bg)" }} readOnly placeholder="Bank Name (Auto-fetched)" value={bank.bankName} />
                </div>
              ))}
              {data.bankAccounts.length < 5 && (
                <button type="button" onClick={() => updateData({ bankAccounts: [...data.bankAccounts, { label: "Primary Settlement", accountName: "", accountNo: "", ifsc: "", bankName: "", upi: "" }] })} style={{ alignSelf: "flex-start", fontSize: 13, padding: "8px 16px", background: "linear-gradient(90deg, #F9A826 0%, #FFCC00 100%)", color: "#0A0A0A", fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer", boxShadow: "0 4px 12px rgba(249, 168, 38, 0.25)" }}>
                  ✦ Add Bank Account
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", background: "var(--scaffold-bg)", display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => setOpen(false)} className="co-btn co-btn-ghost">Cancel</button>
          <div style={{ display: "flex", gap: 12 }}>
            {step > 1 && <button onClick={() => setStep(s => s - 1)} className="co-btn co-btn-secondary">Back</button>}
            {step < 4 ? (
              <button onClick={nextStep} className="co-btn co-btn-primary">Next</button>
            ) : (
              <button onClick={handleSubmit} disabled={isPending} className="co-btn co-btn-primary">
                {isPending ? "Deploying..." : "Deploy Store"}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}