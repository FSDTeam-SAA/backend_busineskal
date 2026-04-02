import { GoogleGenAI } from "@google/genai";
import mongoose from "mongoose";
import { Product } from "../model/product.model.js";
import { Category } from "../model/category.model.js";
import AppError from "../errors/AppError.js";
import httpStatus from "http-status";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

export const detectSearchInputType = ({ text, files }) => {
  const hasText = typeof text === "string" && text.trim();
  const hasVoice = files?.voice?.length > 0 || files?.audio?.length > 0;
  const hasImage = files?.image?.length > 0 || files?.photo?.length > 0;

  const count = [!!hasText, !!hasVoice, !!hasImage].filter(Boolean).length;

  if (count === 0) return null;

  if (count > 1) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please send only one input type at a time: text, voice, or image",
    );
  }

  if (hasText) return "text";
  if (hasVoice) return "voice";
  if (hasImage) return "image";

  return null;
};

export const normalizeSearchText = (value = "") => {
  return String(value).trim().replace(/\s+/g, " ");
};

const escapeRegex = (value = "") => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getSearchTerms = (query) => {
  return query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
};

const bufferToInlinePart = (buffer, mimeType) => ({
  inlineData: {
    data: buffer.toString("base64"),
    mimeType,
  },
});

export const extractQueryFromVoice = async (voiceFile) => {
  try {
    if (!genAI) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "GEMINI_API_KEY is missing. Gemini voice search is not configured",
      );
    }

    const prompt = `
You are a product-search extraction assistant.

Task:
1. Listen to the audio.
2. Extract the user's intended product search query.
3. Return ONLY a short searchable product query.
4. No explanation.
5. Examples:
- "Can you show me iphone 14 pro?" -> iphone 14 pro
- "I want black nike running shoes" -> black nike running shoes
- "Samsung phone under 500 dollars" -> samsung phone under 500 dollars
`;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { text: prompt },
        bufferToInlinePart(voiceFile.buffer, voiceFile.mimetype),
      ],
    });

    return normalizeSearchText(response.text || "");
  } catch (error) {
    if (error instanceof AppError) throw error;

    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Voice processing failed: ${error.message}`,
    );
  }
};

export const extractQueryFromImage = async (imageFile) => {
  try {
    if (!genAI) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "GEMINI_API_KEY is missing. Gemini image search is not configured",
      );
    }

    const prompt = `
You are a product detection assistant.

Task:
1. Look at the image.
2. Identify the product or product type.
3. Return ONLY a short searchable product query.
4. No explanation.
5. Examples:
- iphone 14 pro
- nike running shoes
- wireless bluetooth headphones
- black leather handbag
`;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { text: prompt },
        bufferToInlinePart(imageFile.buffer, imageFile.mimetype),
      ],
    });

    return normalizeSearchText(response.text || "");
  } catch (error) {
    if (error instanceof AppError) throw error;

    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Image processing failed: ${error.message}`,
    );
  }
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
          ...childCategories.map((id) => id._id.toString()),
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
    );
  }

  return { $or: conditions };
};

export const findProductsWithFallback = async ({
  mongoQuery,
  normalizedQuery,
  page,
  limit,
}) => {
  const skip = (page - 1) * limit;

  const products = await Product.find(mongoQuery)
    .populate("category", "name path")
    .populate("vendor", "name storeName")
    .populate("shopId", "name description shopStatus")
    .sort({
      verified: -1,
      soldCount: -1,
      rating: -1,
      createdAt: -1,
    })
    .skip(skip)
    .limit(limit);

  const totalMatched = await Product.countDocuments(mongoQuery);

  if (products.length > 0) {
    return {
      products,
      similarProducts: [],
      totalMatched,
      usedFallback: false,
      fallbackReason: null,
    };
  }

  const terms = getSearchTerms(normalizedQuery);
  const fallbackOr = [];

  for (const term of terms) {
    const safeTerm = escapeRegex(term);
    fallbackOr.push(
      { title: { $regex: safeTerm, $options: "i" } },
      { description: { $regex: safeTerm, $options: "i" } },
      { detailedDescription: { $regex: safeTerm, $options: "i" } },
    );
  }

  if (fallbackOr.length === 0) {
    fallbackOr.push({
      title: { $regex: escapeRegex(normalizedQuery), $options: "i" },
    });
  }

  const similarProducts = await Product.find({ $or: fallbackOr })
    .populate("category", "name path")
    .populate("vendor", "name storeName")
    .populate("shopId", "name description shopStatus")
    .sort({
      verified: -1,
      soldCount: -1,
      rating: -1,
      createdAt: -1,
    })
    .limit(limit);

  return {
    products: [],
    similarProducts,
    totalMatched: 0,
    usedFallback: true,
    fallbackReason:
      similarProducts.length > 0
        ? "No exact match found, returned similar products"
        : "No exact or similar product found",
  };
};

export const generateProductSearchAiReply = async ({
  inputType,
  extractedQuery,
  matchCount,
  usedFallback,
  fallbackReason,
  matchedProducts,
}) => {
  try {
    if (!genAI) {
      if (matchCount === 0) {
        return `I could not find any products for "${extractedQuery}".`;
      }

      if (usedFallback) {
        return `I could not find an exact match for "${extractedQuery}", but I found ${matchCount} similar product${matchCount > 1 ? "s" : ""}.`;
      }

      if (inputType === "image") {
        return `I found ${matchCount} product${matchCount > 1 ? "s" : ""} based on your uploaded image.`;
      }

      if (inputType === "voice") {
        return `I found ${matchCount} matching product${matchCount > 1 ? "s" : ""} based on your voice search.`;
      }

      return `I found ${matchCount} matching product${matchCount > 1 ? "s" : ""} for "${extractedQuery}".`;
    }

    const topProducts = matchedProducts.slice(0, 5).map((item) => ({
      title: item.title,
      price: item.price,
      verified: item.verified,
      stock: item.stock,
    }));

    const prompt = `
You are an ecommerce assistant.

Create a short natural reply for a product search result.

Input type: ${inputType}
Extracted query: ${extractedQuery}
Match count: ${matchCount}
Fallback used: ${usedFallback}
Fallback reason: ${fallbackReason || "none"}

Top products:
${JSON.stringify(topProducts, null, 2)}

Rules:
- Maximum 2 sentences
- Be natural
- If exact result not found, mention similar products
- Do not use markdown
`;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text?.trim() || `I found ${matchCount} matching products.`;
  } catch (error) {
    if (matchCount === 0) {
      return `I could not find any products for "${extractedQuery}".`;
    }

    if (usedFallback) {
      return `I could not find an exact match for "${extractedQuery}", but I found ${matchCount} similar products.`;
    }

    return `I found ${matchCount} matching products for "${extractedQuery}".`;
  }
};