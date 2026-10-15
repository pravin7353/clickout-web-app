import Razorpay from "razorpay";

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  // Safe check if env vars are missing
  if (process.env.NODE_ENV !== "test" && typeof window === "undefined" && !process.env.NEXT_PHASE) {
    console.warn("Razorpay credentials missing in environment");
  }
}

export const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});
