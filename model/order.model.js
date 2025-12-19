import mongoose, { Schema } from "mongoose";

const orderItemSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"],
  },
  price: {
    type: Number,
    required: true,
  },
});

const orderSchema = new Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    items: [orderItemSchema],
    totalAmount: {
      type: Number,
      required: true,
    },
    shippingFee: {
      type: Number,
      default: 5,
    },
    discount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    trackingNumber: {
      type: String,
      default: "",
    },
    expectedDeliveryDate: {
      type: Date,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    coupon: {
      type: Schema.Types.ObjectId,
      ref: "Coupon",
    },
  },
  { timestamps: true }
);

export const Order = mongoose.model("Order", orderSchema);
