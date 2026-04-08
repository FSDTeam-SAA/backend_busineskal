import mongoose from "mongoose";
import { Category } from "../model/category.model.js";
import { escapeRegex, getSearchTerms } from "./search.utils.js";

export const buildGenericSearchQuery = (searchText, searchableFields = []) => {
  const safeSearch = escapeRegex(searchText);
  const searchTerms = getSearchTerms(searchText);

  const conditions = [];

  for (const field of searchableFields) {
    conditions.push({
      [field]: { $regex: safeSearch, $options: "i" },
    });
  }

  for (const term of searchTerms) {
    const safeTerm = escapeRegex(term);

    for (const field of searchableFields) {
      conditions.push({
        [field]: { $regex: safeTerm, $options: "i" },
      });
    }
  }

  if (!conditions.length) return {};

  return { $or: conditions };
};

export const buildProductSearchQuery = async (searchText) => {
  const safeSearch = escapeRegex(searchText);
  const searchTerms = getSearchTerms(searchText);

  const matchedCategories = await Category.find({
    name: { $regex: safeSearch, $options: "i" },
  }).select("_id path");

  let categoryIds = matchedCategories.map((cat) => cat._id);

  if (matchedCategories.length > 0) {
    const categoryPaths = matchedCategories
      .map((cat) => cat.path)
      .filter(Boolean);

    if (categoryPaths.length > 0) {
      const childCategories = await Category.find({
        $or: categoryPaths.map((path) => ({
          path: { $regex: `^${escapeRegex(path)}` },
        })),
      }).select("_id");

      categoryIds = [
        ...new Set([
          ...categoryIds.map((id) => id.toString()),
          ...childCategories.map((item) => item._id.toString()),
        ]),
      ].map((id) => new mongoose.Types.ObjectId(id));
    }
  }

  const conditions = [
    { title: { $regex: safeSearch, $options: "i" } },
    { description: { $regex: safeSearch, $options: "i" } },
    { detailedDescription: { $regex: safeSearch, $options: "i" } },
    { sku: { $regex: safeSearch, $options: "i" } },
    { country: { $regex: safeSearch, $options: "i" } },
  ];

  if (categoryIds.length > 0) {
    conditions.push({ category: { $in: categoryIds } });
  }

  for (const term of searchTerms) {
    const safeTerm = escapeRegex(term);
    conditions.push(
      { title: { $regex: safeTerm, $options: "i" } },
      { description: { $regex: safeTerm, $options: "i" } },
      { detailedDescription: { $regex: safeTerm, $options: "i" } },
      { sku: { $regex: safeTerm, $options: "i" } }
    );
  }

  return { $or: conditions };
};

export const buildCartSearchFilter = (searchText) => {
  const safeSearch = escapeRegex(searchText);
  const terms = getSearchTerms(searchText);

  return (cartDoc) => {
    const items = cartDoc?.items || [];

    return items.filter((item) => {
      const product = item?.product;
      if (!product) return false;

      const haystack = [
        product.title,
        product.sku,
        product.description,
        product.country,
        product?.category?.name,
        product?.vendor?.name,
        product?.vendor?.storeName,
      ]
        .filter(Boolean)
        .join(" ");

      const exactRegex = new RegExp(safeSearch, "i");
      if (exactRegex.test(haystack)) return true;

      return terms.some((term) => new RegExp(escapeRegex(term), "i").test(haystack));
    });
  };
};