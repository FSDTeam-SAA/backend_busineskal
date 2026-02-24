import httpStatus from "http-status";
import { Product } from "../model/product.model.js";
import { Category } from "../model/category.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { User } from "../model/user.model.js";
import { Shop } from "../model/shop.model.js";
import { Wishlist } from "../model/wishlist.model.js";

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


  // If category updated → validate leaf
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

  // Handle new images
  let photos = product.photos;

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
  if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
    const upload = await uploadOnCloudinary(req.files.thumbnail[0].buffer);
    thumbnail = upload.secure_url;
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
  if (search) query.title = { $regex: search, $options: "i" };

  // 💰 Price filter
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  // 📦 Stock filter
  if (inStock === "true") query.stock = { $gt: 0 };
  if (inStock === "false") query.stock = 0;

  // 🏷 Category filter (Hierarchy)
  if (category) {
    const selectedCategory = await Category.findById(category);
    if (!selectedCategory) throw new AppError(httpStatus.BAD_REQUEST, "Invalid category");

    const categories = await Category.find({
      path: { $regex: `^${selectedCategory.path}` },
    }).select("_id");

    query.category = { $in: categories.map((c) => c._id) };
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

  // ✅ 1) Fetch wishlist from Wishlist model
  let wishlistSet = new Set();
  if (req.user?._id) {
    const wishlistDoc = await Wishlist.findOne({ user: req.user._id }).select("products");
    wishlistSet = new Set((wishlistDoc?.products || []).map((id) => id.toString()));
  }

  // ✅ 2) Fetch products
  const products = await Product.find(query)
    .populate("category", "name path")
    .populate("vendor", "name storeName")
    .populate("shopId", "name description shopStatus")
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .sort(sortObj);

  // ✅ 3) Add isWishlisted field using map
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
  const product = await Product.findByIdAndDelete(req.params.id);

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
