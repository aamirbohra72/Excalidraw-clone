import { NextResponse } from "next/server";
import { TEAM_PLAN, getRazorpayAuthHeader } from "../../../lib/razorpay";

export async function POST() {
  const auth = getRazorpayAuthHeader();
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

  if (!auth || !keyId) {
    return NextResponse.json(
      {
        error:
          "Missing Razorpay keys. Add NEXT_PUBLIC_RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in apps/web/.env.local",
      },
      { status: 500 },
    );
  }

  try {
    const receipt = `team_${Date.now().toString(36)}`;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: TEAM_PLAN.amount,
        currency: TEAM_PLAN.currency,
        receipt,
        notes: {
          plan: TEAM_PLAN.id,
          product: "drawapp",
        },
      }),
    });

    const data = (await response.json()) as {
      id?: string;
      amount?: number;
      currency?: string;
      error?: { description?: string };
    };

    if (!response.ok || !data.id) {
      return NextResponse.json(
        { error: data.error?.description || "Failed to create Razorpay order" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      orderId: data.id,
      amount: data.amount ?? TEAM_PLAN.amount,
      currency: data.currency ?? TEAM_PLAN.currency,
      keyId,
      name: "DrawApp",
      description: TEAM_PLAN.description,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order creation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
