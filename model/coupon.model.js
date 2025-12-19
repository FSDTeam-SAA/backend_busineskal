import mongoose, { Schema } from "mongoose";

const couponSchema = new Schema(
  {
    code: {
      type: String,
      required: [true, "Coupon code is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
    },
    discount: {
      type: Number,
      required: [true, "Discount is required"],
      min: [0, "Discount cannot be negative"],
      max: [100, "Discount cannot exceed 100"],
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "percentage",
    },
    validityStart: {
      type: Date,
      required: [true, "Start date is required"],
    },
    validityEnd: {
      type: Date,
      required: [true, "End date is required"],
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    couponImage: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    usageLimit: {
      type: Number,
      default: 0,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Check validity pre-save
couponSchema.pre("save", function (next) {
  if (this.validityStart > this.validityEnd) {
    throw new Error("Start date cannot be after end date");
  }
  if (this.usedCount > this.usageLimit && this.usageLimit > 0) {
    this.status = "inactive";
  }
  next();
});

export const Coupon = mongoose.model("Coupon", couponSchema);
