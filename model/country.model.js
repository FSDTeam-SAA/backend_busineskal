import mongoose, { Schema } from "mongoose";

const countrySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Country name is required"],
      trim: true,
    },
    normalizedName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      select: false,
    },
    flag: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

countrySchema.pre("validate", function updateNormalizedName(next) {
  if (this.name) {
    this.name = this.name.trim();
    this.normalizedName = this.name.toLowerCase();
  }
  next();
});

export const Country = mongoose.model("Country", countrySchema);
