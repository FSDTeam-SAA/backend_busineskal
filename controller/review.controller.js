import httpStatus from "http-status";
import mongoose from "mongoose";
import { User } from "../model/user.model.js";
import { Product } from "../model/product.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";

export const recalculateProductRating = async (productId) => {
  const pid = new mongoose.Types.ObjectId(productId);

  const stats = await User.aggregate([
    { $unwind: "$review" },
    { $match: { "review.product": pid } },
    {
      $group: {
        _id: "$review.product",
        avgRating: { $avg: "$review.rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  const avgRating = stats.length ? stats[0].avgRating : 0;
  const count = stats.length ? stats[0].count : 0;

  await Product.findByIdAndUpdate(productId, {
    rating: Number(avgRating.toFixed(2)),
    reviewsCount: count,
  });

  return { rating: Number(avgRating.toFixed(2)), reviewsCount: count };
};

export const addReview = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { productId, rating, text } = req.body;

  if (!productId || rating === undefined) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "productId and rating are required"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid productId");
  }

  const product = await Product.findById(productId);
  if (!product) throw new AppError(httpStatus.NOT_FOUND, "Product not found");

  if (rating < 0 || rating > 5) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Rating must be between 0 and 5"
    );
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  const already = user.review?.some(
    (r) => r.product?.toString() === productId.toString()
  );
  if (already) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You already reviewed this product"
    );
  }

  user.review.push({
    rating: Number(rating),
    product: productId,
    text: text || "",
  });

  await user.save();

  const stats = await recalculateProductRating(productId);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Review added successfully",
    data: { stats },
  });
});

export const updateMyReview = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.params;
  const { rating, text } = req.body;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid productId");
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  const review = user.review.find((r) => r.product.toString() === productId);
  if (!review) throw new AppError(httpStatus.NOT_FOUND, "Review not found");

  if (rating !== undefined) {
    if (rating < 0 || rating > 5)
      throw new AppError(400, "Rating must be between 0 and 5");
    review.rating = Number(rating);
  }
  if (text !== undefined) review.text = text;

  await user.save();

  const stats = await recalculateProductRating(productId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Review updated successfully",
    data: { stats },
  });
});

export const deleteMyReview = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid productId");
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  const before = user.review.length;
  user.review = user.review.filter((r) => r.product.toString() !== productId);

  if (user.review.length === before) {
    throw new AppError(httpStatus.NOT_FOUND, "Review not found");
  }

  await user.save();

  const stats = await recalculateProductRating(productId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Review deleted successfully",
    data: { stats },
  });
});

export const getProductReviews = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid productId");
  }

  const pid = new mongoose.Types.ObjectId(productId);
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const rows = await User.aggregate([
    { $match: { "review.product": pid } },
    { $project: { name: 1, storeName: 1, avatar: 1, review: 1 } },
    { $unwind: "$review" },
    { $match: { "review.product": pid } },
    { $sort: { "review._id": -1 } }, // best effort ordering
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              _id: 0,
              user: {
                _id: "$_id",
                name: "$name",
                storeName: "$storeName",
                avatar: "$avatar",
              },
              rating: "$review.rating",
              text: "$review.text",
              product: "$review.product",
              reviewId: "$review._id",
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const reviews = rows?.[0]?.data || [];
  const total = rows?.[0]?.total?.[0]?.count || 0;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product reviews fetched",
    data: { reviews, pagination: { total, page: pageNum, limit: limitNum } },
  });
});

export const getMyReviews = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).populate(
    "review.product",
    "title price photos rating reviewsCount"
  );
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My reviews fetched",
    data: { reviews: user.review || [] },
  });
});
