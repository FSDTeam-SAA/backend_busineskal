import { Schema, model } from "mongoose";
import mongoose from "mongoose";

const bannerSchema = new Schema({
  banner: {
    public_id: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  shopId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Shop",
  },
});

export const Banner = model("Banner", bannerSchema);
