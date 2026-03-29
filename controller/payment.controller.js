import { Order } from "../model/order.model.js";
import { paymentInfo } from "../model/payment.model.js";
import { Subscription } from "../model/subscription.model.js";
import { User } from "../model/user.model.js";
import Stripe from "stripe";
import { createNotification } from "../utils/notification.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});

// Admin commission rate - 4.99%
const ADMIN_COMMISSION_RATE = 0.0499;

export const createPayment = async (req, res) => {
  const { userId, price, orderId, subscriptionId, type, billingPeriod } =
    req.body;

  if (!price || !type) {
    return res.status(400).json({ error: "Price and type are required." });
  }

  // Validate type-specific requirements
  if (type === "order" && !orderId) {
    return res
      .status(400)
      .json({ error: "Order ID is required for order payments." });
  }

  if (type === "subscription" && (!subscriptionId || !billingPeriod)) {
    return res.status(400).json({
      error:
        "Subscription ID and billing period are required for subscription payments.",
    });
  }

  try {
    // For subscription payments, verify the subscription exists
    if (type === "subscription") {
      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) {
        return res.status(404).json({ error: "Subscription plan not found." });
      }

      // Verify price matches the selected billing period
      const expectedPrice =
        billingPeriod === "yearly"
          ? subscription.pricePerYear
          : subscription.pricePerMonth;
      if (Math.abs(price - expectedPrice) > 0.01) {
        return res
          .status(400)
          .json({ error: "Price mismatch with subscription plan." });
      }
    }

    // Create metadata based on payment type
    const metadata = { userId, type };
    if (orderId) metadata.orderId = orderId;
    if (subscriptionId) {
      metadata.subscriptionId = subscriptionId;
      metadata.billingPeriod = billingPeriod;
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(price * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata,
    });

    await paymentInfo.create({
      userId,
      orderId: orderId || null,
      subscriptionId: subscriptionId || null,
      price,
      transactionId: paymentIntent.id,
      paymentStatus: "pending",
      type,
      billingPeriod: billingPeriod || null,
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      message: "PaymentIntent created.",
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
    console.log(error);
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
        { paymentStatus: "failed" },
      );

      return res.status(400).json({
        error: "Payment did not succeed",
        status: paymentIntent.status,
      });
    }

    // Update database
    const paymentRecord = await paymentInfo.findOne({
      transactionId: paymentIntentId,
    });

    if (!paymentRecord) {
      return res.status(404).json({ error: "Payment record not found" });
    }

    const wasAlreadyComplete = paymentRecord.paymentStatus === "complete";

    // Calculate admin commission for order payments
    let adminCommission = 0;
    if (paymentRecord.type === "order") {
      adminCommission = paymentRecord.price * ADMIN_COMMISSION_RATE;
    }

    // Update payment record
    await paymentInfo.findOneAndUpdate(
      { transactionId: paymentIntentId },
      {
        paymentStatus: "complete",
        adminCommission,
      },
      { new: true },
    );

    // Handle order payment
    let order = null;
    if (paymentRecord.orderId) {
      order = await Order.findById(paymentRecord.orderId).populate(
        "items.product customer vendor",
      );

      if (order) {
        await Order.findByIdAndUpdate(paymentRecord.orderId, {
          paymentStatus: "paid",
        });
      }
    }

    // Handle subscription payment
    let subscription = null;
    if (paymentRecord.subscriptionId && paymentRecord.type === "subscription") {
      const user = await User.findById(paymentRecord.userId);
      if (user && user.role === "seller") {
        subscription = await Subscription.findById(
          paymentRecord.subscriptionId,
        );
        if (subscription) {
          await Subscription.findByIdAndUpdate(paymentRecord.subscriptionId, {
            paymentStatus: "paid",
          });
        }
      }
    }

    if (!wasAlreadyComplete) {
      if (order) {
        await Promise.all([
          createNotification({
            user: order.customer?._id || paymentRecord.userId,
            actor: paymentRecord.userId,
            order: order._id,
            payment: paymentRecord._id,
            type: "payment_success",
            title: "Payment successful",
            message: `Your payment for order ${order.orderId} was confirmed successfully.`,
            metadata: {
              orderId: order.orderId,
              amount: paymentRecord.price,
            },
          }),
          createNotification({
            user: order.vendor?._id,
            actor: paymentRecord.userId,
            order: order._id,
            payment: paymentRecord._id,
            type: "order_paid",
            title: "Order payment received",
            message: `Payment for order ${order.orderId} has been confirmed.`,
            metadata: {
              orderId: order.orderId,
              amount: paymentRecord.price,
            },
          }),
        ]);
      }

      if (subscription) {
        await createNotification({
          user: paymentRecord.userId,
          actor: paymentRecord.userId,
          subscription: subscription._id,
          payment: paymentRecord._id,
          type: "subscription_paid",
          title: "Subscription payment successful",
          message: `Your payment for the ${subscription.planName} plan was confirmed successfully.`,
          metadata: {
            subscriptionId: subscription._id.toString(),
            amount: paymentRecord.price,
            billingPeriod: paymentRecord.billingPeriod,
          },
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment confirmed",
      paymentIntentId,
      type: paymentRecord.type,
      adminCommission: adminCommission.toFixed(2),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      error: "Internal server error",
      stripeError: error?.message,
    });
  }
};
