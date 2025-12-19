import httpStatus from "http-status";
import { Category } from "../model/category.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../errors/AppError.js";
import { Product } from "../model/product.model.js";

export const addCategory = catchAsync(async (req, res) => {
  const { name, parent } = req.body;

  // Check if category already exists
  const existingCategory = await Category.findOne({ name });
  if (existingCategory) {
    throw new AppError(httpStatus.BAD_REQUEST, "Category already exists");
  }

  let image = {};
  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    image = { public_id: upload.public_id, url: upload.secure_url };
  }

  const category = await Category.create({
    name,
    parent: parent || null,
    image,
  });

  // If parent, add to children and update level/path
  if (parent) {
    await Category.findByIdAndUpdate(parent, {
      $addToSet: { children: category._id },
    });

    // Re-save to calculate level and path
    await category.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Category added successfully",
    data: category,
  });
});

export const getCategories = catchAsync(async (req, res) => {
  const { parent, includeProducts } = req.query;

  let query = { isActive: true };
  if (parent === "null" || parent === "") {
    query.parent = null;
  } else if (parent) {
    query.parent = parent;
  }

  const categories = await Category.find(query)
    .populate("children", "name image level")
    .populate("parent", "name")
    .sort({ level: 1, name: 1 });

  // Optionally include product counts
  if (includeProducts === "true") {
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const productCount = await Product.countDocuments({
          category: category._id,
        });

        const associatedProducts = await Product.find({
          category: category._id,
        });
        return {
          ...category.toObject(),
          associatedProducts,
          productCount,
        };
      })
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Categories with product counts fetched",
      data: categoriesWithCounts,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Categories fetched successfully",
    data: categories,
  });
});

export const updateCategory = catchAsync(async (req, res) => {
  const { name, parent } = req.body;

  const category = await Category.findById(req.params.id);
  if (!category) {
    throw new AppError(httpStatus.NOT_FOUND, "Category not found");
  }

  const updates = { name };

  // Handle parent change
  if (parent && parent !== category.parent?.toString()) {
    // Remove from old parent's children
    if (category.parent) {
      await Category.findByIdAndUpdate(category.parent, {
        $pull: { children: category._id },
      });
    }

    // Add to new parent's children
    updates.parent = parent;
    await Category.findByIdAndUpdate(parent, {
      $addToSet: { children: category._id },
    });
  }

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    updates.image = { public_id: upload.public_id, url: upload.secure_url };
  }

  const updatedCategory = await Category.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true }
  ).populate("children", "name image");

  // Re-save to update level and path
  await updatedCategory.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Category updated successfully",
    data: updatedCategory,
  });
});

export const deleteCategory = catchAsync(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    throw new AppError(httpStatus.NOT_FOUND, "Category not found");
  }

  // Check if category has products
  const productCount = await Product.countDocuments({ category: category._id });
  if (productCount > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot delete category with ${productCount} products. Move products first.`
    );
  }

  // Check if category has subcategories
  const childCount = await Category.countDocuments({ parent: category._id });
  if (childCount > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot delete category with ${childCount} subcategories. Delete subcategories first.`
    );
  }

  // Remove from parent's children array
  if (category.parent) {
    await Category.findByIdAndUpdate(category.parent, {
      $pull: { children: category._id },
    });
  }

  await Category.findByIdAndDelete(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Category deleted successfully",
  });
});

// NEW: Get category with all subcategories
export const getCategoryTree = catchAsync(async (req, res) => {
  const buildTree = async (parentId = null) => {
    const categories = await Category.find({ parent: parentId, isActive: true })
      .populate("children", "name image level")
      .sort({ level: 1, name: 1 });

    const tree = await Promise.all(
      categories.map(async (category) => {
        const children = await buildTree(category._id);
        const productCount = await Product.countDocuments({
          category: category._id,
        });
        const associatedProducts = await Product.find({
          category: category._id,
        });

        return {
          _id: category._id,
          name: category.name,
          image: category.image,
          level: category.level,
          path: category.path,
          associatedProducts,
          productCount,
          children: children.length > 0 ? children : undefined,
        };
      })
    );

    return tree;
  };

  const categoryTree = await buildTree();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Category tree fetched successfully",
    data: categoryTree,
  });
});
