import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: "chat",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["Message", "PriceRequest", "OfferAccepted", "System"],
    },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification = mongoose.model("Notification", notificationSchema);
