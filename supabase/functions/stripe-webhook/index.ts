// stripe-webhook — Stripe tells us a Checkout payment went through; we ticket the booking.
// The return page also confirms (booking { action: "confirm" }), so whichever arrives first
// does the work and the other is a no-op.
//
// In Stripe → Developers → Webhooks, add an endpoint:
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
// listening for checkout.session.completed, and save its signing secret as STRIPE_WEBHOOK_SECRET.
import { admin, json } from "../_shared/util.ts";
import { finalize } from "../_shared/booking.ts";

const enc = new TextEncoder();

async function verify(raw: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t;
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // replay window
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].every((c, i) => c === hex[i]));
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const raw = await req.text();
  if (!secret || !(await verify(raw, req.headers.get("stripe-signature") ?? "", secret))) {
    return new Response("bad signature", { status: 400 });
  }
  const event = JSON.parse(raw);
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object;
    const id = s.metadata?.booking_id;
    if (id && s.payment_status === "paid") await finalize(admin(), id, s.payment_intent);
  }
  return json({ received: true });
});
