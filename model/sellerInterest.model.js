import mongoose from "mongoose";

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200, unique: true },
  business: { type: String, required: true, trim: true, maxlength: 150 },
  offering: { type: String, required: true, enum: ["Products", "Services", "Products & services"] },
}, { timestamps: true });

export const SellerInterest = mongoose.model("SellerInterest", schema);
