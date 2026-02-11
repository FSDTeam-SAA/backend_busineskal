import { Schema, model } from "mongoose";

const shopSchema = new Schema({
  name: {
    type: String,
    
  },
  description: {
    type: String,
    
  },
  certificate: {
    public_id: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  banner: {
    public_id: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  address: {
    type: String,
    
  },
  products: [
    {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },
  ],
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  shopStatus: {
    type: String,
    enum: ["verified", "not verified"],
    default: "not verified",
  },
});

export const Shop = model("Shop", shopSchema);
