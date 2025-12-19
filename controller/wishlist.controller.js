import httpStatus from "http-status";
import { Wishlist } from "../model/wishlist.model.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";

export const addToWishlist = catchAsync(async (req, res) => {
  const { product } = req.body;
  const user = req.user._id;

  let wishlist = await Wishlist.findOne({ user });

  if (!wishlist) {
    wishlist = await Wishlist.create({ user, products: [product] });
  } else {
    if (!wishlist.products.includes(product)) {
      wishlist.products.push(product);
      await wishlist.save();
    }
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Added to wishlist",
    data: wishlist,
  });
});

export const getWishlist = catchAsync(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id }).populate(
    "products",
    "title price photos rating"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Wishlist fetched",
    data: wishlist || { products: [] },
  });
});

export const removeFromWishlist = catchAsync(async (req, res) => {
  const wishlist = await Wishlist.findOneAndUpdate(
    { user: req.user._id },
    { $pull: { products: req.params.productId } },
    { new: true }
  ).populate("products");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Removed from wishlist",
    data: wishlist,
  });
});
