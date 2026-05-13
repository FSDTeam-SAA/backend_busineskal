import mongoose, { Schema } from "mongoose";

const callSchema = new Schema(
  {
    callId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    caller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    callee: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
      index: true,
    },
    callType: {
      type: String,
      enum: ["audio", "video"],
      required: true,
      default: "audio",
    },
    status: {
      type: String,
      enum: [
        "ringing",
        "connected",
        "rejected",
        "busy",
        "unreachable",
        "missed",
        "canceled",
        "ended",
        "failed",
      ],
      required: true,
      default: "ringing",
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    answeredAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    endedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    endReason: {
      type: String,
      trim: true,
      default: "",
    },
    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ callee: 1, createdAt: -1 });
callSchema.index({ status: 1, createdAt: -1 });

export const Call = mongoose.model("Call", callSchema);
