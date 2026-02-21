import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
  {
    text: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["text", "file", "image", "video", "audio"],
      default: "text",
    },
    attachments: [
      {
        public_id: { type: String },
        url: { type: String },
        fileName: { type: String },
        mimeType: { type: String },
        size: { type: Number },
        resourceType: { type: String },
      },
    ],
    askPrice: {
      type: Boolean,
      default: false,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true }
);

const chatSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    messages: [messageSchema],
  },
  { timestamps: true }
);

export const Chat = mongoose.model("Chat", chatSchema);
