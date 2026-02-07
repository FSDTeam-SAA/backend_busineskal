import { Schema, model } from "mongoose";

const bannerSchema = new Schema({
  banner: {
    public_id: { type: String, default: "" },
    url: { type: String, default: "" },
  },
});

export const Banner = model("Banner", bannerSchema);
