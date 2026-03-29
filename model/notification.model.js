import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
    },
    shop: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      default: null,
    },
    service: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      default: null,
    },
    subscription: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    payment: {
      type: Schema.Types.ObjectId,
      ref: "paymentInfo",
      default: null,
    },
    contactUs: {
      type: Schema.Types.ObjectId,
      ref: "ContactUs",
      default: null,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: { type: Boolean, default: false },
    readAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);
