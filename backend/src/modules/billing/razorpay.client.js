import Razorpay from "razorpay";
import { ApiError } from "../../utils/ApiError.js";

export function createRazorpayClient(env) {
  if (!env?.RAZORPAY_KEY_ID || !env?.RAZORPAY_KEY_SECRET) {
    throw new ApiError(
      503,
      "BILLING_NOT_CONFIGURED",
      "Billing checkout is not configured.",
    );
  }
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}
