import httpStatus from "http-status";
import { Product } from "../model/product.model.js";
import { Category } from "../model/category.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { User } from "../model/user.model.js";

export const addProduct = catchAsync(async (req, res) => {
  const {
    title,
    description,
    detailedDescription,
    price,
    colors,
    category,
    sku,
    stock,
  } = req.body;
  const vendor = req.user._id;

  // Validate vendor
  const user = await User.findById(vendor);
  if (
    !user ||
    (user.role !== "manager" && user.role !== "admin") ||
    user.vendorStatus !== "approved"
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only managers and admins with approved vendor status can add products"
    );
  }

  // Validate category
  const cat = await Category.findById(category);
  if (!cat) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid category");
  }

  // Handle file uploads - FIXED
  const photos = [];
  if (req.files && req.files.photos) {
    // req.files.photos is an array of files from the "photos" field
    for (let file of req.files.photos) {
      const upload = await uploadOnCloudinary(file.buffer);
      photos.push({
        public_id: upload.public_id,
        url: upload.secure_url,
      });
    }
  }

  const product = await Product.create({
    title,
    description,
    detailedDescription,
    price: parseFloat(price),
    colors: colors ? colors.split(",").map((color) => color.trim()) : [],
    photos,
    category,
    vendor,
    sku,
    stock: stock ? parseInt(stock) : 0,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Product added successfully",
    data: product,
  });
});

export const updateProduct = catchAsync(async (req, res) => {
  const {
    title,
    description,
    detailedDescription,
    price,
    colors,
    category,
    sku,
    stock,
  } = req.body;

  const product = await Product.findById(req.params.id);
  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  // Authorization check
  if (
    req.user.role === "manager" &&
    product.vendor.toString() !== req.user._id.toString()
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Cannot update other vendor's product"
    );
  }

  // Handle file uploads - FIXED
  let photos = product.photos; // Keep existing photos
  if (req.files && req.files.photos) {
    // Add new photos to existing ones
    for (let file of req.files.photos) {
      const upload = await uploadOnCloudinary(file.buffer);
      photos.push({
        public_id: upload.public_id,
        url: upload.secure_url,
      });
    }
  }

  const updates = {
    title,
    description,
    detailedDescription,
    price: price ? parseFloat(price) : product.price,
    colors: colors
      ? colors.split(",").map((color) => color.trim())
      : product.colors,
    category: category || product.category,
    sku: sku || product.sku,
    stock: stock ? parseInt(stock) : product.stock,
    photos,
  };

  const updatedProduct = await Product.findByIdAndUpdate(
    req.params.id,
    updates,
    {
      new: true,
      runValidators: true,
    }
  )
    .populate("category", "name path")
    .populate("vendor", "name storeName");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product updated successfully",
    data: updatedProduct,
  });
});

export const getProducts = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    category,
    search,
    user,
    type, // "popular" | "featured"
    minPrice,
    maxPrice,
    inStock, // "true" | "false"
    sort, // optional override
  } = req.query;

  const query = {};

  if (category) query.category = category;
  if (search) query.title = { $regex: search, $options: "i" };

  // price filtering
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  // stock filtering
  if (inStock === "true") query.stock = { $gt: 0 };
  if (inStock === "false") query.stock = 0;

  const ensureInStock = () => {
    if (inStock !== "false") {
      if (!query.stock) query.stock = { $gt: 0 };
      if (typeof query.stock === "number") {
      } else if (
        query.stock &&
        query.stock.$gt === undefined &&
        query.stock.$gte === undefined
      ) {
        query.stock.$gt = 0;
      }
    }
  };

  if (type === "featured") {
    query.verified = true;
    ensureInStock();

    query.rating = { $gte: 4 };
    query.reviewsCount = { $gte: 1 };
  }

  if (type === "popular") {
    query.verified = true;
    ensureInStock();

    query.$or = [{ soldCount: { $gt: 0 } }, { reviewsCount: { $gte: 1 } }];
  }

  let sortObj = { createdAt: -1 };

  if (type === "popular") {
    sortObj = { soldCount: -1, rating: -1, reviewsCount: -1, createdAt: -1 };
  }

  if (type === "featured") {
    sortObj = { rating: -1, reviewsCount: -1, createdAt: -1 };
  }

  if (sort === "price_asc") sortObj = { price: 1 };
  if (sort === "price_desc") sortObj = { price: -1 };
  if (sort === "latest") sortObj = { createdAt: -1 };

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const products = await Product.find(query)
    .populate("category", "name")
    .populate("vendor", "name storeName")
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .sort(sortObj);

  const total = await Product.countDocuments(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Products fetched",
    data: { products, pagination: { total, page: pageNum, limit: limitNum } },
  });
});

export const getProductById = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate("category", "name")
    .populate("vendor", "name storeName email");

  if (!product) throw new AppError(httpStatus.NOT_FOUND, "Product not found");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product fetched",
    data: product,
  });
});

export const deleteProduct = catchAsync(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);

  if (!product) throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  if (
    req.user.role === "manager" &&
    product.vendor.toString() !== req.user._id.toString()
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Cannot delete other vendor's product"
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product deleted",
    data: product,
  });
});

// Admin-specific: Verify product
export const verifyProduct = catchAsync(async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { verified: true },
    { new: true }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product verified",
    data: product,
  });
});
