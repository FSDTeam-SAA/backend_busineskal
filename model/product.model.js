import mongoose, { Schema } from "mongoose";

const productSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Product title is required"],
      trim: true,
    },
    detailedDescription: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Price cannot be negative"],
    },
    colors: [
      {
        type: String,
        trim: true,
      },
    ],
    photos: [
      {
        public_id: { type: String },
        url: { type: String },
      },
    ],
    thumbnail: {
      type: String,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, "Stock cannot be negative"],
    },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["in_stock", "out_of_stock", "low_stock"],
      default: "in_stock",
    },
    verified: {
      type: Boolean,
      default: false,
    },
    soldCount: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
      min: [0, "Rating cannot be negative"],
      max: [5, "Rating cannot exceed 5"],
    },
    country: {
      type: String,
      default: "",
    },
    reviewsCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Update stock status on stock change
productSchema.pre("save", function (next) {
  if (this.isModified("stock")) {
    if (this.stock === 0) {
      this.status = "out_of_stock";
    } else if (this.stock < 5) {
      this.status = "low_stock";
    } else {
      this.status = "in_stock";
    }
  }
  next();
});

productSchema.index({ verified: 1, category: 1, price: 1 });
productSchema.index({ vendor: 1 });


export const Product = mongoose.model("Product", productSchema);
