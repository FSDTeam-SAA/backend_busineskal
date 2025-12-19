import { Order } from "../model/order.model.js";
import { paymentInfo } from "../model/payment.model.js";
import { User } from "../model/user.model.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});

export const createPayment = async (req, res) => {
  const { userId, price, orderId } = req.body;

  if (!price) {
    return res.status(400).json({ error: "amount is required." });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(price * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { userId, orderId },
    });

    await paymentInfo.create({
      userId,
      orderId,
      price,
      transactionId: paymentIntent.id,
      paymentStatus: "pending",
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      message: "PaymentIntent created.",
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
};

export const confirmPayment = async (req, res) => {
  const { paymentIntentId } = req.body;

  if (!paymentIntentId) {
    return res.status(400).json({ error: "Missing paymentIntentId" });
  }

  try {
    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent) {
      return res.status(404).json({ error: "PaymentIntent not found" });
    }

    // Check final status
    if (paymentIntent.status !== "succeeded") {
      await paymentInfo.findOneAndUpdate(
        { transactionId: paymentIntentId },
        { paymentStatus: "failed" }
      );

      return res.status(400).json({
        error: "Payment did not succeed",
        status: paymentIntent.status,
      });
    }

    // Update database
    const paymentRecord = await paymentInfo.findOneAndUpdate(
      { transactionId: paymentIntentId },
      { paymentStatus: "complete" },
      { new: true }
    );

    if (paymentRecord?.orderId) {
      const order = await Order.findById(paymentRecord.orderId).populate(
        "product user seller"
      );

      await Order.findByIdAndUpdate(paymentRecord.orderId, {
        paymentStatus: "paid",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment confirmed",
      paymentIntentId,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      error: "Internal server error",
      stripeError: error?.message,
    });
  }
};
