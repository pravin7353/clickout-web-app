"use client";

import { useEffect, useState } from "react";
import { isSignInWithEmailLink, signInWithEmailLink, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { signIn, useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { clientAuth } from "@/lib/firebase-client";
import { sendMagicLink } from "@/actions/magic-link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isGooglePending, setIsGooglePending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const router = useRouter();

  // Suppress harmless Firebase SDK internal popup assertion errors when popup is closed or blocked
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = event?.reason?.message || String(event?.reason || "");
      if (
        msg.includes("Pending promise was never set") ||
        msg.includes("INTERNAL ASSERTION FAILED") ||
        msg.includes("auth/popup-closed-by-user") ||
        msg.includes("auth/cancelled-popup-request")
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  useEffect(() => {
    async function completeSignIn() {
      if (isSignInWithEmailLink(clientAuth, window.location.href)) {
        setVerifying(true);
        let storedEmail = window.localStorage.getItem("emailForSignIn");
        if (!storedEmail) {
          storedEmail = window.prompt("Confirm your email to complete sign-in:");
        }
        if (!storedEmail) { setVerifying(false); return; }

        try {
          const cred = await signInWithEmailLink(clientAuth, storedEmail, window.location.href);
          window.localStorage.removeItem("emailForSignIn");
          const idToken = await cred.user.getIdToken(true);
          const res = await signIn("credentials", { idToken, redirect: false });
          if (res?.error) setError("Access denied.");
          else router.push("/");
        } catch {
          setError("This link is invalid or expired. Please request a new one.");
        } finally {
          setVerifying(false);
        }
      }
    }
    completeSignIn();
  }, [router]);

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsPending(true);
    const res = await sendMagicLink(email, window.location.origin);
    setIsPending(false);
    if (!res.ok) setError(res.error ?? "Failed to send link.");
    else {
      window.localStorage.setItem("emailForSignIn", email);
      setSent(true);
    }
  }

  async function handleGoogleSignIn() {
    if (isGooglePending) return;
    setIsGooglePending(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(clientAuth, provider);
      const idToken = await cred.user.getIdToken();
      const res = await signIn("credentials", { idToken, redirect: false });
      if (res?.error) {
        setError("Access denied: You do not have command center privileges.");
      } else {
        router.push("/");
      }
    } catch (err: any) {
      const code = err?.code || "";
      const msg = err?.message || "";
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        msg.includes("Pending promise was never set")
      ) {
        // User closed or cancelled popup window
        return;
      }
      setError("Google sign-in failed. Please try again or use Magic Link.");
    } finally {
      setIsGooglePending(false);
    }
  }

  const { data: session, status } = useSession();

  if (verifying) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--scaffold-bg)" }}>
        <p style={{ color: "var(--text-secondary)" }}>Signing you in…</p>
      </div>
    );
  }

  if (status === "authenticated" && session?.user) {
    const role = ((session.user as any)?.role || "STAFF").toString().toUpperCase();
    const accessibleTenants = ((session.user as any)?.accessibleTenants as any[]) || [];
    const userEmail = session.user.email || "Active User";
    const userName = session.user.name || userEmail.split("@")[0];
    const destinationPath =
      role === "TENANT_ADMIN"
        ? "/tenant-admin"
        : role === "CASHIER"
        ? "/cashier"
        : role === "GUARD"
        ? "/guard"
        : role === "AUDITOR"
        ? accessibleTenants.length > 1
          ? "/select-company"
          : "/auditor"
        : "/dashboard";

    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--scaffold-bg)", fontFamily: "system-ui, sans-serif", padding: 20 }}>
        <div style={{ width: 400, maxWidth: "100%", background: "var(--card-bg)", borderRadius: 20, padding: 36, boxShadow: "0 10px 40px rgba(0,0,0,0.15)", border: "1px solid var(--border)", textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px 0" }}>
            Click<span style={{ color: "var(--success)" }}>Out</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "0 0 24px 0" }}>
            Command Center Gateway
          </p>

          <div style={{ background: "color-mix(in srgb, var(--success) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--success) 35%, transparent)", borderRadius: 14, padding: "16px 20px", marginBottom: 24, textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)", display: "inline-block" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Active Session Detected
              </span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{userName}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{userEmail}</div>
            <div style={{ marginTop: 10, display: "inline-block", background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: "var(--text-primary)" }}>
              ROLE: {role}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => router.push(destinationPath)}
              style={{
                width: "100%",
                padding: "12px 18px",
                borderRadius: 10,
                background: "var(--cta-bg)",
                color: "var(--cta-text)",
                fontWeight: 700,
                fontSize: 14,
                border: "none",
                cursor: "pointer",
              }}
            >
              Continue to Dashboard →
            </button>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              style={{
                width: "100%",
                padding: "10px 18px",
                borderRadius: 10,
                background: "transparent",
                color: "var(--danger)",
                fontWeight: 600,
                fontSize: 13,
                border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
                cursor: "pointer",
              }}
            >
              Sign Out / Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--scaffold-bg)", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: 380, background: "var(--card-bg)", borderRadius: 16, padding: 40, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, textAlign: "center", marginBottom: 4 }}>
          Click<span style={{ color: "var(--success)" }}>Out</span>
        </h1>
        <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, marginBottom: 32 }}>
          Command Center Gateway
        </p>

        {sent ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 14 }}>✅ Link sent to <strong>{email}</strong></p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
              Check your inbox and click the link to sign in. It expires in 1 hour.
            </p>
            <button onClick={() => setSent(false)} style={{ marginTop: 16, fontSize: 13, color: "var(--success)", background: "none", border: "none", cursor: "pointer" }}>
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendLink}>
            <label style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase" }}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourstore.com"
              required
              style={{ width: "100%", padding: "10px 0", marginTop: 4, marginBottom: 20, border: "none", borderBottom: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: 15, outline: "none" }}
            />
            {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button
              type="submit"
              disabled={isPending}
              style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "var(--text-primary)", color: "var(--scaffold-bg)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
            >
              {isPending ? "Sending…" : "Send Magic Link →"}
            </button>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center", marginTop: 10 }}>
              We&apos;ll send a secure password-less login link.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGooglePending || isPending}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontWeight: 600,
                fontSize: 14,
                cursor: isGooglePending ? "not-allowed" : "pointer",
                opacity: isGooglePending ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.92c1.71-1.57 2.68-3.88 2.68-6.64z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34C2.44 15.98 5.48 18 9 18z"/>
                <path fill="#FBBC05" d="M3.97 10.71a5.4 5.4 0 010-3.42V4.95H.96a9 9 0 000 8.1l3.01-2.34z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.95l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
              </svg>
              {isGooglePending ? "Connecting to Google…" : "Continue with Google"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
