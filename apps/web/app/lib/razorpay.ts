export const TEAM_PLAN = {
  id: "team",
  name: "Team",
  /** Amount in paise (₹99.00) */
  amount: 9900,
  currency: "INR",
  description: "DrawApp Team plan",
} as const;

export function getRazorpayAuthHeader() {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return null;
  }
  const token = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return `Basic ${token}`;
}
