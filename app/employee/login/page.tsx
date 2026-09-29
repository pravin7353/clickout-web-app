"use client";

import { useEffect, useRef, useState } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";
import { signIn, useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { clientAuth } from "@/lib/firebase-client";
import { linkStaffPhoneLogin } from "@/actions/staff";
import { getClientDeviceInfo } from "@/lib/utils/device";
import Link from "next/link";

export default function EmployeeLoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [revokedMessage, setRevokedMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Register Service Worker for static employee shell caching
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/employee/" }).catch(() => {
        // Service worker registration optional
      });
    }
  }, []);

  // Check URL parameters for revocation or redirected notices
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const isRevoked = params.get("revoked") === "1" || params.get("reason") === "SESSION_REVOKED";
      if (isRevoked) {
        setRevokedMessage("Your device link was reset. Please log in again.");
        // Automatically flush stale client auth & NextAuth session cookies
        clientAuth.signOut().catch(() => {});
        signOut({ redirect: false }).catch(() => {});
      } else if (params.get("message")) {
        setRevokedMessage(params.get("message") || "");
      }
    }
  }, []);

  // Setup countdown timer for resend OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Clean up reCAPTCHA on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // ignore cleanup errors
        }
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  function getOrInitRecaptcha(): RecaptchaVerifier {
    if (!recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current = new RecaptchaVerifier(clientAuth, "recaptcha-container", {
        size: "invisible",
        callback: () => {
          // reCAPTCHA solved
        },
        "expired-callback": () => {
          setError("reCAPTCHA expired. Please try sending OTP again.");
        },
      });
    }
    return recaptchaVerifierRef.current;
  }

  async function handleSendOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError("");

    const cleanDigits = phoneNumber.replace(/\D/g, "");
    if (cleanDigits.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    const fullPhoneNumber = `${countryCode}${cleanDigits}`;
    setIsPending(true);

    try {
      const verifier = getOrInitRecaptcha();
      const confirmationResult = await signInWithPhoneNumber(clientAuth, fullPhoneNumber, verifier);
      confirmationResultRef.current = confirmationResult;
      setStep("otp");
      setCountdown(30);
    } catch (err: any) {
      console.error("Phone Auth error:", err);
      // Reset reCAPTCHA on failure
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {}
        recaptchaVerifierRef.current = null;
      }

      if (err?.code === "auth/invalid-phone-number") {
        setError("Invalid phone number format.");
      } else if (err?.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again after a few minutes.");
      } else if (err?.code === "auth/quota-exceeded") {
        setError("SMS quota exceeded. Please contact your administrator.");
      } else {
        setError(err?.message || "Failed to send verification code. Please try again.");
      }
    } finally {
      setIsPending(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    if (!confirmationResultRef.current) {
      setError("Session expired. Please request a new verification code.");
      setStep("phone");
      return;
    }

    setIsPending(true);

    try {
      // 1. Confirm OTP with Firebase Phone Auth
      const cred = await confirmationResultRef.current.confirm(cleanOtp);
      const idToken = await cred.user.getIdToken(true);

      // Get persistent device UUID, label, and secondary fingerprint
      const { deviceId, deviceLabel, fingerprint } = await getClientDeviceInfo();

      // 2. Call server action to verify idToken, check/link authUid, bind deviceId, and set custom claims
      const linkRes = await linkStaffPhoneLogin(idToken, deviceId, deviceLabel, fingerprint);

      if (!linkRes.ok) {
        // Specific rejection (e.g. "This account is registered on another device. Ask your manager to reset your device.")
        setError(linkRes.error || "Failed to link staff device.");
        // Sign out Firebase client auth to leave clean state
        await clientAuth.signOut();
        setIsPending(false);
        return;
      }

      // 3. Force refresh token to include newly assigned custom claims (role, tenantId, staffId)
      const refreshedIdToken = await cred.user.getIdToken(true);

      // 4. Create NextAuth session with persistent deviceId and deviceLabel
      const authResult = await signIn("credentials", {
        idToken: refreshedIdToken,
        deviceId,
        deviceLabel,
        fingerprint,
        redirect: false,
      });

      if (authResult?.error) {
        setError("Failed to establish employee session: " + authResult.error);
        setIsPending(false);
        return;
      }

      // 5. Navigate to Employee Portal
      router.push("/employee");
      router.refresh();
    } catch (err: any) {
      console.error("OTP verification error:", err);
      if (err?.code === "auth/invalid-verification-code") {
        setError("Incorrect verification code. Please check and try again.");
      } else if (err?.code === "auth/code-expired") {
        setError("Verification code has expired. Please request a new one.");
      } else {
        setError(err?.message || "Failed to verify code.");
      }
      setIsPending(false);
    }
  }

  // Active session card view (suppressed if revoked notice is active)
  const isRevokedParam = typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("revoked") === "1" || new URLSearchParams(window.location.search).get("reason") === "SESSION_REVOKED");
  if (!revokedMessage && !isRevokedParam && status === "authenticated" && session?.user) {
    const user = session.user as any;
    const hasStaffClaim = Boolean(user.staffId);
    const role = (user.role || "STAFF").toUpperCase();

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--scaffold-bg)",
          padding: 16,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "var(--card-bg)",
            borderRadius: 20,
            padding: 32,
            border: "1px solid var(--border)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              margin: "0 auto 16px auto",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.35)",
            }}
          >
            📱
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
            Click<span style={{ color: "var(--success)" }}>Out</span> Employee
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
            Active Session Found
          </p>

          <div
            style={{
              background: "color-mix(in srgb, var(--card-bg) 90%, var(--border))",
              borderRadius: 14,
              padding: 16,
              marginBottom: 20,
              textAlign: "left",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
              {user.name || "Staff Member"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              {user.email || user.phone || `Staff ID: ${user.staffId || user.id}`}
            </div>
            <div
              style={{
                marginTop: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                background: hasStaffClaim
                  ? "color-mix(in srgb, var(--success) 15%, transparent)"
                  : "color-mix(in srgb, var(--danger) 15%, transparent)",
                color: hasStaffClaim ? "var(--success)" : "var(--danger)",
              }}
            >
              <span>{hasStaffClaim ? "● DEVICE LINKED" : "○ NO DEVICE LINK"}</span>
              <span>•</span>
              <span>{role}</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {hasStaffClaim ? (
              <button
                onClick={() => router.push("/employee")}
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
                Go to Employee Dashboard →
              </button>
            ) : (
              <p style={{ fontSize: 12, color: "var(--danger)", margin: "0 0 8px 0" }}>
                This account does not have a linked operational staff device. Sign out below to link your staff phone number.
              </p>
            )}

            <button
              onClick={async () => {
                await clientAuth.signOut();
                await signOut({ callbackUrl: "/employee/login" });
              }}
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
              Sign Out &amp; Use Different Phone
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--scaffold-bg)",
        padding: 16,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
      <div id="recaptcha-container" />

      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--card-bg)",
          borderRadius: 20,
          padding: 32,
          border: "1px solid var(--border)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
        }}
      >
        {/* App Branding */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg, #3b82f6 0%, #10b981 100%)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              margin: "0 auto 14px auto",
              boxShadow: "0 4px 14px rgba(59, 130, 246, 0.35)",
            }}
          >
            ⚡
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            Click<span style={{ color: "var(--success)" }}>Out</span>
          </h1>
          <div
            style={{
              display: "inline-block",
              marginTop: 6,
              padding: "3px 10px",
              borderRadius: 6,
              background: "color-mix(in srgb, var(--cta-bg) 12%, transparent)",
              color: "var(--cta-bg)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Employee Self-Service
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 8, marginBottom: 0 }}>
            {step === "phone"
              ? "Sign in with your registered staff phone number"
              : "Enter the 6-digit OTP code sent to your phone"}
          </p>
        </div>

        {/* Device Reset Notice Banner */}
        {revokedMessage && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--warning, #f59e0b) 35%, transparent)",
              color: "var(--warning, #d97706)",
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.4,
              marginBottom: 20,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <span>⚠️</span>
            <div style={{ flex: 1 }}>{revokedMessage}</div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "color-mix(in srgb, var(--danger) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
              color: "var(--danger)",
              fontSize: 13,
              lineHeight: 1.4,
              marginBottom: 20,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <span>⚠️</span>
            <div style={{ flex: 1 }}>{error}</div>
          </div>
        )}

        {/* Step 1: Phone Number Input */}
        {step === "phone" ? (
          <form onSubmit={handleSendOtp}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              Registered Mobile Number
            </label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--scaffold-bg)",
                overflow: "hidden",
                marginBottom: 20,
                transition: "border-color 0.15s ease",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  borderRight: "1px solid var(--border)",
                  background: "color-mix(in srgb, var(--border) 40%, transparent)",
                  userSelect: "none",
                }}
              >
                {countryCode}
              </div>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="98765 43210"
                autoFocus
                required
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isPending || phoneNumber.length !== 10}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: "var(--text-primary)",
                color: "var(--scaffold-bg)",
                fontWeight: 800,
                fontSize: 14,
                cursor: isPending || phoneNumber.length !== 10 ? "not-allowed" : "pointer",
                opacity: isPending || phoneNumber.length !== 10 ? 0.6 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "opacity 0.15s ease",
              }}
            >
              {isPending ? "Sending OTP..." : "Send Verification Code →"}
            </button>

            <p
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                textAlign: "center",
                marginTop: 14,
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              A 6-digit one-time code will be sent via SMS to verify this device.
            </p>
          </form>
        ) : (
          /* Step 2: OTP Verification */
          <form onSubmit={handleVerifyOtp}>
            <div
              style={{
                background: "color-mix(in srgb, var(--border) 25%, transparent)",
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Code sent to</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                  {countryCode} {phoneNumber}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setError("");
                }}
                disabled={isPending}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--cta-bg)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 4,
                }}
              >
                Change
              </button>
            </div>

            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              6-Digit OTP Code
            </label>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              autoFocus
              required
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--scaffold-bg)",
                color: "var(--text-primary)",
                fontSize: 22,
                fontWeight: 800,
                textAlign: "center",
                letterSpacing: "0.4em",
                outline: "none",
                marginBottom: 20,
              }}
            />

            <button
              type="submit"
              disabled={isPending || otp.length !== 6}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: "var(--text-primary)",
                color: "var(--scaffold-bg)",
                fontWeight: 800,
                fontSize: 14,
                cursor: isPending || otp.length !== 6 ? "not-allowed" : "pointer",
                opacity: isPending || otp.length !== 6 ? 0.6 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {isPending ? "Verifying & Linking Device..." : "Confirm & Access Portal →"}
            </button>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              {countdown > 0 ? (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Resend code in {countdown}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendOtp()}
                  disabled={isPending}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--cta-bg)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Resend OTP Code
                </button>
              )}
            </div>
          </form>
        )}

        {/* Command Center Link Footer */}
        <div
          style={{
            marginTop: 28,
            paddingTop: 18,
            borderTop: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <Link
            href="/login"
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Are you a Store Manager or Admin? <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>Command Center Login →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
