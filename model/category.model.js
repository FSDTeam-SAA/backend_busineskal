import mongoose, { Schema } from "mongoose";

const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      unique: true,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    children: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    image: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    level: {
      type: Number,
      default: 1,
    },
    path: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export const Category = mongoose.model("Category", categorySchema);
