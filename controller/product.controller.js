import httpStatus from "http-status";
import { Product } from "../model/product.model.js";
import { Category } from "../model/category.model.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
  extractPublicIdFromCloudinaryUrl,
} from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { User } from "../model/user.model.js";
import { Shop } from "../model/shop.model.js";

const parseArrayField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
};

export const addProduct = catchAsync(async (req, res) => {
  const {
    title,
    detailedDescription,
    price,
    colors,
    category,
    subcategory,
    shopId,
    sku,
    stock,
    country,
  } = req.body;

  const vendor = req.user._id;

  // Validate vendor
  const user = await User.findById(vendor);
  if (
    !user ||
    (user.role !== "seller" && user.role !== "admin") ||
    user.vendorStatus !== "approved"
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only approved sellers or admins can add products",
    );
  }

  // Prefer subcategory when provided
  const categoryId = subcategory || category;

  // Validate category (must be leaf)
  const cat = await Category.findById(categoryId);
  if (!cat) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid category");
  }

  if (cat.children && cat.children.length > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please select a sub-category (leaf category)",
    );
  }

  // Handle file uploads
  const photos = [];

  if (req.files && req.files.photos) {
    for (let file of req.files.photos) {
      const upload = await uploadOnCloudinary(file.buffer);

      photos.push({
        public_id: upload.public_id,
        url: upload.secure_url,
      });
    }
  }

  let thumbnail = null;
  if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
    const upload = await uploadOnCloudinary(req.files.thumbnail[0].buffer);
    thumbnail = upload.secure_url;
  } else if (photos.length > 0) {
    thumbnail = photos[0].url;
  }

  const product = await Product.create({
    title,
    detailedDescription,
    price: parseFloat(price),
    colors: colors ? colors.split(",").map((color) => color.trim()) : [],
    photos,
    category: categoryId,
    country,
    vendor,
    shopId,
    sku,
    thumbnail,
    stock: stock ? parseInt(stock) : 0,
  });

  // Push product to shop
  await Shop.findByIdAndUpdate(shopId, {
    $addToSet: { products: product._id },
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
    subcategory,
    sku,
    stock,
    country,
  } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  // Authorization
  if (
    req.user.role === "seller" &&
    product.vendor.toString() !== req.user._id.toString()
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Cannot update other vendor's product",
    );
  }
  const categoryId = subcategory || category;

  // If category updated -> validate leaf
  if (categoryId) {
    const cat = await Category.findById(categoryId);

    if (!cat) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid category");
    }

    if (cat.children && cat.children.length > 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Please select a sub-category (leaf category)",
      );
    }
  }

  const removedPhotos = parseArrayField(req.body.removedPhotos);
  const removeThumbnail =
    req.body.removeThumbnail === "true" || req.body.removeThumbnail === true;

  const removedPhotoPublicIds = new Set();
  const removedPhotoUrls = new Set();

  for (const item of removedPhotos) {
    if (!item) continue;
    const value = String(item);

    if (/^https?:\/\//i.test(value)) {
      removedPhotoUrls.add(value);
      const extractedId = extractPublicIdFromCloudinaryUrl(value);
      if (extractedId) removedPhotoPublicIds.add(extractedId);
      continue;
    }

    removedPhotoPublicIds.add(value);
  }

  // Handle new images
  let photos = Array.isArray(product.photos) ? [...product.photos] : [];
  const removedPhotoRecords = [];
  if (removedPhotoPublicIds.size > 0 || removedPhotoUrls.size > 0) {
    const keptPhotos = [];
    for (const photo of photos) {
      let shouldRemove = false;

      if (photo?.public_id && removedPhotoPublicIds.has(photo.public_id)) {
        shouldRemove = true;
      }
      if (photo?.url && removedPhotoUrls.has(photo.url)) {
        shouldRemove = true;
      }
      if (photo?.url) {
        const extractedId = extractPublicIdFromCloudinaryUrl(photo.url);
        if (extractedId && removedPhotoPublicIds.has(extractedId)) {
          shouldRemove = true;
        }
      }

      if (shouldRemove) {
        removedPhotoRecords.push(photo);
      } else {
        keptPhotos.push(photo);
      }
    }

    photos = keptPhotos;
  }

  if (req.files && req.files.photos) {
    for (let file of req.files.photos) {
      const upload = await uploadOnCloudinary(file.buffer);

      photos.push({
        public_id: upload.public_id,
        url: upload.secure_url,
      });
    }
  }

  let thumbnail = product.thumbnail;
  let thumbnailToDelete = null;
  if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
    const upload = await uploadOnCloudinary(req.files.thumbnail[0].buffer);
    thumbnail = upload.secure_url;
    thumbnailToDelete = extractPublicIdFromCloudinaryUrl(product.thumbnail);
  } else if (removeThumbnail) {
    thumbnail = "";
    thumbnailToDelete = extractPublicIdFromCloudinaryUrl(product.thumbnail);
  }

  const updates = {
    title: title ?? product.title,
    description: description ?? product.description,
    detailedDescription: detailedDescription ?? product.detailedDescription,
    price: price ? parseFloat(price) : product.price,
    colors: colors
      ? colors.split(",").map((color) => color.trim())
      : product.colors,
    category: categoryId ?? product.category,
    sku: sku ?? product.sku,
    stock: stock ? parseInt(stock) : product.stock,
    country: country ?? product.country,
    photos,
    thumbnail,
  };

  const updatedProduct = await Product.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true },
  )
    .populate("category", "name path")
    .populate("vendor", "name storeName")
    .populate("shopId", "name description shopStatus");

  const cloudinaryIdsToDelete = new Set([...removedPhotoPublicIds]);
  for (const photo of removedPhotoRecords) {
    if (photo?.public_id) {
      cloudinaryIdsToDelete.add(photo.public_id);
      continue;
    }
    if (photo?.url) {
      const extractedId = extractPublicIdFromCloudinaryUrl(photo.url);
      if (extractedId) cloudinaryIdsToDelete.add(extractedId);
    }
  }
  if (thumbnailToDelete) cloudinaryIdsToDelete.add(thumbnailToDelete);

  if (cloudinaryIdsToDelete.size > 0) {
    try {
      await deleteFromCloudinary([...cloudinaryIdsToDelete]);
    } catch (error) {
      console.warn("Cloudinary delete error:", error);
    }
  }

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
    type,
    minPrice,
    maxPrice,
    inStock,
    sort,
  } = req.query;

  const query = {};

  // 🔎 Search
  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  // 💰 Price filter
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  // 📦 Stock filter
  if (inStock === "true") query.stock = { $gt: 0 };
  if (inStock === "false") query.stock = 0;

  // 🏷 Category filter (Hierarchy Support)
  if (category) {
    const selectedCategory = await Category.findById(category);

    if (!selectedCategory) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid category");
    }

    const categories = await Category.find({
      path: { $regex: `^${selectedCategory.path}` },
    }).select("_id");

    const categoryIds = categories.map((cat) => cat._id);

    query.category = { $in: categoryIds };
  }

  // 🌟 Type logic
  if (type === "featured") {
    query.verified = true;
    query.rating = { $gte: 4 };
    query.reviewsCount = { $gte: 1 };
  }

  if (type === "popular") {
    query.verified = true;
    query.$or = [{ soldCount: { $gt: 0 } }, { reviewsCount: { $gte: 1 } }];
  }

  // 🔃 Sorting
  let sortObj = { createdAt: -1 };

  if (type === "popular") {
    sortObj = {
      soldCount: -1,
      rating: -1,
      reviewsCount: -1,
      createdAt: -1,
    };
  }

  if (type === "featured") {
    sortObj = {
      rating: -1,
      reviewsCount: -1,
      createdAt: -1,
    };
  }

  if (sort === "price_asc") sortObj = { price: 1 };
  if (sort === "price_desc") sortObj = { price: -1 };
  if (sort === "latest") sortObj = { createdAt: -1 };

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const products = await Product.find(query)
    .populate("category", "name path")
    .populate("vendor", "name storeName")
    .populate("shopId", "name description shopStatus")
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .sort(sortObj);

  const total = await Product.countDocuments(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Products fetched",
    data: {
      products,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
      },
    },
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
  const product = await Product.findById(req.params.id);

  if (!product) throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  if (
    req.user.role === "seller" &&
    product.vendor.toString() !== req.user._id.toString()
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Cannot delete other vendor's product",
    );
  }

  const cloudinaryIdsToDelete = new Set(
    Array.isArray(product.photos)
      ? product.photos
          .map(
            (photo) =>
              photo?.public_id ||
              extractPublicIdFromCloudinaryUrl(photo?.url),
          )
          .filter(Boolean)
      : [],
  );

  if (product.thumbnail) {
    const thumbnailId = extractPublicIdFromCloudinaryUrl(product.thumbnail);
    if (thumbnailId) cloudinaryIdsToDelete.add(thumbnailId);
  }

  await Product.findByIdAndDelete(req.params.id);

  if (cloudinaryIdsToDelete.size > 0) {
    try {
      await deleteFromCloudinary([...cloudinaryIdsToDelete]);
    } catch (error) {
      console.warn("Cloudinary delete error:", error);
    }
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product deleted",
    data: product,
  });
});

export const getMyProducts = catchAsync(async (req, res) => {
  const products = await Product.find({ vendor: req.user._id }).sort({
    createdAt: -1,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your products fetched successfully",
    data: products,
  });
});

export const getPendingProducts = catchAsync(async (req, res) => {
  const products = await Product.find({ verified: false })
    .populate("vendor", "name email vendorStatus")
    .populate("category", "name")
    .sort({ createdAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending products fetched",
    data: products,
  });
});

export const updateProductVerification = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { verified } = req.body; // true / false

  if (typeof verified !== "boolean") {
    throw new AppError(httpStatus.BAD_REQUEST, "Verified must be boolean");
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  product.verified = verified;
  await product.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: verified
      ? "Product approved successfully"
      : "Product rejected successfully",
    data: {
      _id: product._id,
      verified: product.verified,
    },
  });
});
