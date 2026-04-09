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
import { Wishlist } from "../model/wishlist.model.js";
import {
  createNotification,
  getUserDisplayName,
  notifyAdmins,
} from "../utils/notification.js";
import {
  detectSearchInputType,
  extractQueryFromVoice,
  extractQueryFromImage,
  buildProductSearchQuery,
  findProductsWithFallback,
  generateProductSearchAiReply,
  normalizeSearchText,
} from "../service/productSearch.service.js";

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
    minOrderQty,
    packSize,
    deliveryTimeDays,
    availableRegions,
  } = req.body;

  const vendor = req.user._id;

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

  const categoryId = subcategory || category;

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

  const shop = await Shop.findById(shopId);
  if (!shop) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid shop");
  }

  const existingSku = await Product.findOne({ sku: sku?.trim() });
  if (existingSku) {
    throw new AppError(httpStatus.BAD_REQUEST, "SKU already exists");
  }

  const photos = [];

  if (req.files && req.files.photos) {
    for (const file of req.files.photos) {
      const upload = await uploadOnCloudinary(file.buffer);
      photos.push({
        public_id: upload.public_id,
        url: upload.secure_url,
      });
    }
  }

  let thumbnail = "";
  if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
    const upload = await uploadOnCloudinary(req.files.thumbnail[0].buffer);
    thumbnail = upload.secure_url;
  } else if (photos.length > 0) {
    thumbnail = photos[0].url;
  }

  const parsedColors = parseArrayField(colors);
  const parsedRegions = parseArrayField(availableRegions);

  const product = await Product.create({
    title,
    detailedDescription,
    price: Number(price),
    colors: parsedColors,
    photos,
    thumbnail,
    category: categoryId,
    country: country || "",
    vendor,
    shopId,
    sku: sku?.trim(),
    stock: stock !== undefined ? Number(stock) : 0,
    minOrderQty: minOrderQty !== undefined ? Number(minOrderQty) : 1,
    packSize: packSize || "",
    deliveryTimeDays:
      deliveryTimeDays !== undefined ? Number(deliveryTimeDays) : 0,
    availableRegions: parsedRegions,
  });

  await Shop.findByIdAndUpdate(shopId, {
    $addToSet: { products: product._id },
  });

  if (req.user.role === "seller") {
    await notifyAdmins({
      actor: req.user._id,
      product: product._id,
      shop: shopId || null,
      type: "product_submitted",
      title: "New product submitted",
      message: `${getUserDisplayName(req.user)} submitted "${product.title}" for review.`,
      metadata: {
        productId: product._id.toString(),
      },
    });
  }

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
    minOrderQty,
    packSize,
    deliveryTimeDays,
    availableRegions,
  } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

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

  if (sku && sku.trim() !== product.sku) {
    const existingSku = await Product.findOne({
      sku: sku.trim(),
      _id: { $ne: product._id },
    });

    if (existingSku) {
      throw new AppError(httpStatus.BAD_REQUEST, "SKU already exists");
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
    for (const file of req.files.photos) {
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
    price: price !== undefined ? Number(price) : product.price,
    colors: colors !== undefined ? parseArrayField(colors) : product.colors,
    category: categoryId ?? product.category,
    sku: sku ? sku.trim() : product.sku,
    stock: stock !== undefined ? Number(stock) : product.stock,
    country: country ?? product.country,
    minOrderQty:
      minOrderQty !== undefined ? Number(minOrderQty) : product.minOrderQty,
    packSize: packSize ?? product.packSize,
    deliveryTimeDays:
      deliveryTimeDays !== undefined
        ? Number(deliveryTimeDays)
        : product.deliveryTimeDays,
    availableRegions:
      availableRegions !== undefined
        ? parseArrayField(availableRegions)
        : product.availableRegions,
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

  if (thumbnailToDelete) {
    cloudinaryIdsToDelete.add(thumbnailToDelete);
  }

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
    packSize,
    minOrderQty,
    regions,
    verified,
    shopId,
    vendor,
    country,
  } = req.query;

  const query = {};

  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  if (inStock === "true") query.stock = { $gt: 0 };
  if (inStock === "false") query.stock = 0;

  if (verified === "true") query.verified = true;
  if (verified === "false") query.verified = false;

  if (shopId) {
    query.shopId = shopId;
  }

  if (vendor) {
    query.vendor = vendor;
  }

  if (country) {
    query.country = { $regex: `^${country}$`, $options: "i" };
  }

  if (packSize) {
    query.packSize = { $regex: `^${packSize}$`, $options: "i" };
  }

  if (minOrderQty) {
    query.minOrderQty = { $lte: Number(minOrderQty) };
  }

  if (regions) {
    const regionsArray = String(regions)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (regionsArray.length > 0) {
      query.availableRegions = { $in: regionsArray };
    }
  }

  if (category) {
    const selectedCategory = await Category.findById(category);
    if (!selectedCategory) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid category");
    }

    const categories = await Category.find({
      path: { $regex: `^${selectedCategory.path}` },
    }).select("_id");

    query.category = { $in: categories.map((c) => c._id) };
  }

  if (type === "featured") {
    query.verified = true;
    query.rating = { $gte: 4 };
    query.reviewsCount = { $gte: 1 };
  }

  if (type === "popular") {
    query.verified = true;
    query.$or = [{ soldCount: { $gt: 0 } }, { reviewsCount: { $gte: 1 } }];
  }

  let sortObj = { createdAt: -1 };

  if (type === "popular") {
    sortObj = { soldCount: -1, rating: -1, reviewsCount: -1, createdAt: -1 };
  }

  if (type === "featured") {
    sortObj = { rating: -1, reviewsCount: -1, createdAt: -1 };
  }

  if (sort === "price_asc") sortObj = { price: 1, createdAt: -1 };
  if (sort === "price_desc") sortObj = { price: -1, createdAt: -1 };
  if (sort === "latest") sortObj = { createdAt: -1 };
  if (sort === "rating_desc") sortObj = { rating: -1, createdAt: -1 };
  if (sort === "sold_desc") sortObj = { soldCount: -1, createdAt: -1 };

  const pageNum = Number(page);
  const limitNum = Number(limit);

  let wishlistSet = new Set();
  if (req.user?._id) {
    const wishlistDoc = await Wishlist.findOne({ user: req.user._id }).select(
      "products",
    );
    wishlistSet = new Set(
      (wishlistDoc?.products || []).map((id) => id.toString()),
    );
  }

  const products = await Product.find(query)
    .populate("category", "name path")
    .populate("vendor", "name storeName")
    .populate("shopId", "name description shopStatus")
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .sort(sortObj);

  const updatedProducts = products.map((product) => {
    const p = product.toObject();
    return {
      ...p,
      isWishlisted: wishlistSet.has(product._id.toString()),
    };
  });

  const total = await Product.countDocuments(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Products fetched",
    data: {
      products: updatedProducts,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  });
});

export const getProductById = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate("category", "name path")
    .populate("vendor", "name storeName email")
    .populate("shopId", "name description shopStatus");

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  let isWishlisted = false;

  if (req.user?._id) {
    const wishlistDoc = await Wishlist.findOne({ user: req.user._id }).select(
      "products",
    );
    isWishlisted = (wishlistDoc?.products || []).some(
      (id) => id.toString() === product._id.toString(),
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product fetched",
    data: {
      ...product.toObject(),
      isWishlisted,
    },
  });
});

export const deleteProduct = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

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
    if (thumbnailId) {
      cloudinaryIdsToDelete.add(thumbnailId);
    }
  }

  await Product.findByIdAndDelete(req.params.id);

  await Shop.findByIdAndUpdate(product.shopId, {
    $pull: { products: product._id },
  });

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
  const { page = 1, limit = 10, search, verified, shopId } = req.query;

  const query = { vendor: req.user._id };

  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  if (verified === "true") query.verified = true;
  if (verified === "false") query.verified = false;

  if (shopId) {
    query.shopId = shopId;
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const products = await Product.find(query)
    .populate("category", "name path")
    .populate("shopId", "name description shopStatus")
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  const total = await Product.countDocuments(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your products fetched successfully",
    data: {
      products,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  });
});

export const getPendingProducts = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search, shopId } = req.query;

  const query = { verified: false };

  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  if (shopId) {
    query.shopId = shopId;
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const products = await Product.find(query)
    .populate("vendor", "name email vendorStatus")
    .populate("category", "name path")
    .populate("shopId", "name description shopStatus")
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  const total = await Product.countDocuments(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending products fetched",
    data: {
      products,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  });
});

export const updateProductVerification = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { verified } = req.body;

  if (typeof verified !== "boolean") {
    throw new AppError(httpStatus.BAD_REQUEST, "Verified must be boolean");
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  product.verified = verified;
  await product.save();

  if (product.vendor.toString() !== req.user._id.toString()) {
    await createNotification({
      user: product.vendor,
      actor: req.user._id,
      product: product._id,
      type: verified ? "product_approved" : "product_rejected",
      title: verified ? "Product approved" : "Product rejected",
      message: verified
        ? `"${product.title}" has been approved and is now live.`
        : `"${product.title}" was rejected. Please review the listing and submit it again.`,
      metadata: {
        verified,
      },
    });
  }

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

export const searchProduct = catchAsync(async (req, res) => {
  const { text, page = 1, limit = 10 } = req.body || {};
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 10;

  const inputType = detectSearchInputType({
    text,
    files: req.files,
  });

  if (!inputType) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please provide one search input: text, voice, or image",
    );
  }

  let extractedQuery = "";

  if (inputType === "text") {
    extractedQuery = normalizeSearchText(text);

    if (!extractedQuery) {
      throw new AppError(httpStatus.BAD_REQUEST, "Search text is required");
    }
  }

  if (inputType === "voice") {
    const voiceFile =
      req.files?.voice?.[0] ||
      req.files?.audio?.[0] ||
      req.file ||
      null;

    if (!voiceFile) {
      throw new AppError(httpStatus.BAD_REQUEST, "Voice file is required");
    }

    extractedQuery = await extractQueryFromVoice(voiceFile);

    if (!extractedQuery) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Could not extract searchable text from voice",
      );
    }
  }

  if (inputType === "image") {
    const imageFile =
      req.files?.image?.[0] ||
      req.files?.photo?.[0] ||
      req.file ||
      null;

    if (!imageFile) {
      throw new AppError(httpStatus.BAD_REQUEST, "Image file is required");
    }

    extractedQuery = await extractQueryFromImage(imageFile);

    if (!extractedQuery) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Could not detect product information from image",
      );
    }
  }

  const normalizedQuery = normalizeSearchText(extractedQuery);

  if (!normalizedQuery) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid search query");
  }

  const mongoQuery = await buildProductSearchQuery(normalizedQuery);

  const {
    products,
    similarProducts,
    totalMatched,
    usedFallback,
    fallbackReason,
  } = await findProductsWithFallback({
    mongoQuery,
    normalizedQuery,
    page: pageNum,
    limit: limitNum,
  });

  const finalProducts = usedFallback ? similarProducts : products;

  let wishlistSet = new Set();
  if (req.user?._id) {
    const wishlistDoc = await Wishlist.findOne({ user: req.user._id }).select(
      "products",
    );
    wishlistSet = new Set(
      (wishlistDoc?.products || []).map((id) => id.toString()),
    );
  }

  const updatedProducts = finalProducts.map((product) => {
    const p = product.toObject ? product.toObject() : product;
    return {
      ...p,
      isWishlisted: wishlistSet.has(product._id.toString()),
    };
  });

  const aiReply = await generateProductSearchAiReply({
    inputType,
    extractedQuery: normalizedQuery,
    matchCount: updatedProducts.length,
    usedFallback,
    fallbackReason,
    matchedProducts: updatedProducts,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product search completed successfully",
    data: {
      extractedQuery: normalizedQuery,
      inputType,
      aiReply,
      fallbackUsed: usedFallback,
      matchedProducts: updatedProducts,
      pagination: {
        total: usedFallback ? updatedProducts.length : totalMatched,
        page: pageNum,
        limit: limitNum,
      },
    },
  });
});