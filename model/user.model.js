import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { raw } from "express";

const userSchema = new Schema(
  {
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    name: { type: String },
    email: {
      type: String,
      trim: true,
    },
    password: { type: String, select: false },
    username: {
      type: String,
      trim: true,
    },
    storeName: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    bio: { type: String, maxlength: 500 },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
    dob: {
      type: Date,
    },
    avatar: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    storeLogo: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    storeDescription: { type: String, trim: true },
    tradeLicense: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    description: { type: String },
    address: { type: String },
    city: { type: String },
    postalCode: { type: String },
    country: { type: String },
    taxId: { type: String },
    passport: { type: String },
    idCard: { type: String },
    nationality: { type: String },
    vendorStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    notifications: {
      type: Boolean,
      default: true,
    },
    language: {
      type: String,
      default: "en",
    },
    otp: {
      hash: { type: String, default: "" },
      expiresAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      lastSentAt: { type: Date, default: null },
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
    },
    role: {
      type: String,
      enum: ["user", "admin", "seller"],
      default: "user",
    },
    verificationInfo: {
      verified: { type: Boolean, default: false },
      token: { type: String, default: "" },
    },
    password_reset_token: { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    isEmailVerified: { type: Boolean, default: false },

    review: [
      {
        rating: {
          type: Number,
          min: [0, "Rating cannot be negative"],
          max: [5, "Rating cannot exceed 5"],
          default: 0,
        },
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        text: {
          type: String,
        },
      },
    ],
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    const saltRounds = Number(process.env.bcrypt_salt_round) || 10;
    this.password = await bcrypt.hash(this.password, saltRounds);
  }

  // seller role enforcement
  if (this.isModified("role") && this.role === "seller") {
    this.managerStatus = "pending";
  }

  next();
});

userSchema.statics.isUserExistsByEmail = async function (email) {
  return await this.findOne({ email }).select("+password");
};

userSchema.statics.isOTPVerified = async function (id) {
  const user = await this.findById(id).select("+verificationInfo");
  return user?.verificationInfo.verified;
};

userSchema.statics.isPasswordMatched = async function (
  plainTextPassword,
  hashPassword,
) {
  return await bcrypt.compare(plainTextPassword, hashPassword);
};

userSchema.statics.findByPhone = async function (phone) {
  return await this.findOne({ phone });
};

export const User = mongoose.model("User", userSchema);
