// loyalty-sync — pull a signed-in user's airline mileage balances from AwardWallet.
//
// STATUS: placeholder until the AwardWallet Business account is approved.
//
// How it will work (AwardWallet "Account Access API"):
//   1. The user taps "Connect AwardWallet" in Miles. We send them to AwardWallet's
//      consent page; they choose which loyalty accounts to share with Flight Time.
//   2. AwardWallet redirects back with a connection we store per user.
//   3. This function fetches that user's shared accounts and upserts them into
//      public.loyalty_accounts with source = 'awardwallet'.
// Docs: https://awardwallet.com/api/main  (request API access from business.awardwallet.com)
//
// Until then, users add programs and balances by hand in the Miles tab (source = 'manual'),
// and their member numbers are shown at checkout so bookings still earn miles.
import { cors, fail, json } from "../_shared/util.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!Deno.env.get("AWARDWALLET_API_KEY")) {
    return json({ connected: false, message: "AwardWallet isn't connected yet. Add your programs by hand for now." });
  }
  return fail("AwardWallet sync is not built yet.", 501);
});
