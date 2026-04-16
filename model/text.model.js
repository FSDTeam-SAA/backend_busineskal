import mongoose from "mongoose";

const textSchema = new mongoose.Schema(
  {
    text1: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    text2: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    text3: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
  }
);

// 🔥 compound unique index (important)
textSchema.index(
  { text1: 1, text2: 1, text3: 1 },
  { unique: true }
);

export const Text = mongoose.model("Text", textSchema);