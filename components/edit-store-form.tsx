"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { updateStoreProfile, getStoreForEdit } from "@/actions/store";
import { Modal } from "@/components/profile-menu";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", 
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", 
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", 
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu & Kashmir", "Chandigarh", "Other"
];
const LICENSE_TYPES = ["GSTIN", "FSSAI", "Drug License", "Liquor License", "Trade License", "Fire NOC", "Other"];

export function EditStoreForm({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  
  const [fetchingPincode, setFetchingPincode] = useState(false);
  const [fetchingIfscFor, setFetchingIfscFor] = useState<number | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [data, setData] = useState({
    storeName: "", gstin: "", city: "", address: "", state: "", pincode: "",
    licenses: [] as { type: string; number: string }[],
    bankAccounts: [] as { label: string; accountName: string; accountNo: string; ifsc: string; bankName: string; upi: string }[]
  });

  useEffect(() => {
    getStoreForEdit(storeId).then(res => {
      if (res) {
        const cleanedBanks = (res.bankAccounts || []).map((b: any) => ({ label: b.label || "Primary Settlement", accountName: b.accountName || "", accountNo: b.accountNo || "", ifsc: b.ifsc || "", bankName: b.bankName || "", upi: b.upi || "" }));
        const lics = res.licenses && res.licenses.length > 0 ? res.licenses : [{ type: "GSTIN", number: "" }];
        setData({ ...res, bankAccounts: cleanedBanks, licenses: lics } as any);
      }
      setIsLoading(false);
    });
  }, [storeId]);

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
      } catch (e) {}
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
      } catch (e) {}
      setFetchingIfscFor(null);
    }, 400);
  };

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await updateStoreProfile({ storeId, ...data });
      if (!res?.ok) setError(res?.error ?? "Failed to update");
      else onClose();
    });
  }

  const sectionHeaderStyle = { color: "var(--success)", fontSize: 14, fontWeight: 600, margin: "24px 0 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" };

  return (
    <Modal onClose={onClose}>
      <div className="co-card" style={{ width: "100%", maxWidth: 700, maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "var(--scaffold-bg)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>Update Operational Node</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>Loading node data...</div>
        ) : (
          <div style={{ overflowY: "auto", flex: 1, padding: "0 24px 24px 24px" }}>
            <form id="edit-store-form" onSubmit={handleSubmit}>
              {error && <div style={{ background: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)", padding: 12, borderRadius: 8, fontSize: 13, border: "1px solid var(--danger)", marginTop: 24 }}>{error}</div>}
              
              <div style={sectionHeaderStyle}><span>1. Core Identity</span></div>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Store Name *</label><input className="co-input" style={{ width: "100%" }} required value={data.storeName} onChange={e => updateData({storeName: e.target.value})} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Primary GSTIN</label><input className="co-input" style={{ width: "100%" }} value={data.gstin} onChange={e => updateData({gstin: e.target.value.toUpperCase()})} /></div>
              </div>

              <div style={sectionHeaderStyle}><span>2. Location Details</span></div>
              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <label style={labelStyle}>Pincode *</label>
                  <input className="co-input" style={{ width: "100%" }} required maxLength={6} value={data.pincode} onChange={e => handlePincode(e.target.value.replace(/\D/g, ''))} />
                  {fetchingPincode && <span style={{ position: "absolute", right: 12, top: 32, fontSize: 12 }}>⏳</span>}
                </div>
                <div style={{ flex: 1 }}><label style={labelStyle}>City *</label><input className="co-input" style={{ width: "100%" }} required value={data.city} onChange={e => updateData({city: e.target.value})} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>State *</label>
                  <select className="co-input" style={{ width: "100%" }} required value={data.state} onChange={e => updateData({state: e.target.value})}>
                    <option value="">Select State</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div><label style={labelStyle}>Complete Address *</label><textarea className="co-input" style={{ width: "100%", minHeight: 60, resize: "vertical" }} required value={data.address} onChange={e => updateData({address: e.target.value})} /></div>

              <div style={sectionHeaderStyle}>
                <span>3. Legal & Compliance</span>
                {data.licenses.length < 5 && <button type="button" onClick={() => updateData({ licenses: [...data.licenses, { type: "GSTIN", number: "" }] })} style={{ color: "var(--success)", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>+ Add</button>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {data.licenses.map((lic, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <select className="co-input" style={{ flex: 1 }} value={lic.type} onChange={e => { const newLics = [...data.licenses]; newLics[idx].type = e.target.value; updateData({ licenses: newLics }); }}>
                      {LICENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input className="co-input" style={{ flex: 2 }} placeholder="License Number" value={lic.number} onChange={e => { const newLics = [...data.licenses]; newLics[idx].number = e.target.value.toUpperCase(); updateData({ licenses: newLics }); }} />
                    <button type="button" onClick={() => updateData({ licenses: data.licenses.filter((_, i) => i !== idx) })} style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16 }}>✕</button>
                  </div>
                ))}
              </div>

              <div style={sectionHeaderStyle}><span>4. Banking & Settlement Node</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {data.bankAccounts.map((bank, idx) => (
                  <div key={idx} style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12, position: "relative", background: "var(--scaffold-bg)" }}>
                    <button type="button" onClick={() => updateData({ bankAccounts: data.bankAccounts.filter((_, i) => i !== idx) })} style={{ position: "absolute", top: 16, right: 16, background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16 }}>✕</button>
                    <div style={{ marginBottom: 12, width: "calc(100% - 30px)" }}>
                      <label style={labelStyle}>Account Purpose</label>
                      <select className="co-input" style={{ width: "100%" }} value={bank.label} onChange={e => { const b = [...data.bankAccounts]; b[idx].label = e.target.value; updateData({ bankAccounts: b }); }}>
                        <option value="Primary Settlement">Primary Settlement</option>
                        <option value="Instore">Instore</option>
                        <option value="Online Delivery">Online Delivery</option>
                        <option value="Vendor payment">Vendor payment</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>Store Account Holder Name *</label>
                      <input className="co-input" style={{ width: "100%" }} value={bank.accountName} onChange={e => { const b = [...data.bankAccounts]; b[idx].accountName = e.target.value; updateData({ bankAccounts: b }); }} />
                    </div>
                    <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Store Settlement Account *</label>
                        <input className="co-input" style={{ width: "100%" }} value={bank.accountNo} onChange={e => { const b = [...data.bankAccounts]; b[idx].accountNo = e.target.value.replace(/\D/g, ''); updateData({ bankAccounts: b }); }} />
                      </div>
                      <div style={{ flex: 1, position: "relative" }}>
                        <label style={labelStyle}>IFSC Code *</label>
                        <input className="co-input" style={{ width: "100%" }} maxLength={11} value={bank.ifsc} onChange={e => handleIfsc(e.target.value, idx)} />
                        {fetchingIfscFor === idx && <span style={{ position: "absolute", right: 12, top: 32, fontSize: 12 }}>⏳</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Resolved Branch Name</label>
                        <input className="co-input" style={{ width: "100%", background: "var(--card-bg)" }} readOnly value={bank.bankName} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Settlement UPI ID</label>
                        <input className="co-input" style={{ width: "100%" }} value={bank.upi} onChange={e => { const b = [...data.bankAccounts]; b[idx].upi = e.target.value; updateData({ bankAccounts: b }); }} />
                      </div>
                    </div>
                  </div>
                ))}
                {data.bankAccounts.length < 5 && (
                  <button type="button" onClick={() => updateData({ bankAccounts: [...data.bankAccounts, { label: "Primary Settlement", accountName: "", accountNo: "", ifsc: "", bankName: "", upi: "" }] })} style={{ color: "var(--success)", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, alignSelf: "center", marginTop: 8, fontWeight: 600 }}>+ Add Another Account</button>
                )}
              </div>
            </form>
          </div>
        )}

        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0, background: "var(--scaffold-bg)" }}>
          <button type="button" onClick={onClose} className="co-btn co-btn-ghost">Cancel</button>
          <button type="submit" form="edit-store-form" disabled={isPending || isLoading} className="co-btn co-btn-primary">
            {isPending ? "Saving..." : "Update Platform OS"}
          </button>
        </div>
      </div>
    </Modal>
  );
}