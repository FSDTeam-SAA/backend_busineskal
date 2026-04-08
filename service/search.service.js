import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import { Wishlist } from "../model/wishlist.model.js";
import { SEARCH_CONFIG, SEARCH_ENTITIES } from "../utils/search.config.js";
import {
  detectSearchInputType,
  normalizeSearchText,
  extractQueryFromVoice,
  extractQueryFromImage,
  generateGenericSearchAiReply,
} from "../utils/search.utils.js";
import {
  buildGenericSearchQuery,
  buildProductSearchQuery,
  buildCartSearchFilter,
} from "../utils/search.builders.js";
import { findDocumentsWithFallback } from "../utils/search.executor.js";

const getVoiceFile = (req) =>
  req.files?.voice?.[0] || req.files?.audio?.[0] || req.file || null;

const getImageFile = (req) =>
  req.files?.image?.[0] || req.files?.photo?.[0] || req.file || null;

export const executeEntitySearch = async ({
  entityType,
  req,
  entityLabel,
  baseFilter = {},
}) => {
  const { text, page = 1, limit = 10 } = req.body || {};
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 10;

  const config = SEARCH_CONFIG[entityType];

  if (!config) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid search entity");
  }

  const inputType = detectSearchInputType({
    text,
    files: req.files,
    file: req.file,
  });

  if (!inputType) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please provide one search input: text, voice, or image"
    );
  }

  if (!config.allowedInputs.includes(inputType)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `${inputType} search is not supported for ${entityLabel}`
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
    const voiceFile = getVoiceFile(req);

    if (!voiceFile) {
      throw new AppError(httpStatus.BAD_REQUEST, "Voice file is required");
    }

    extractedQuery = await extractQueryFromVoice({
      voiceFile,
      entityLabel,
    });

    if (!extractedQuery) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Could not extract searchable text from voice"
      );
    }
  }

  if (inputType === "image") {
    const imageFile = getImageFile(req);

    if (!imageFile) {
      throw new AppError(httpStatus.BAD_REQUEST, "Image file is required");
    }

    extractedQuery = await extractQueryFromImage({
      imageFile,
      entityLabel,
    });

    if (!extractedQuery) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Could not detect searchable data from image"
      );
    }
  }

  const normalizedQuery = normalizeSearchText(extractedQuery);

  if (!normalizedQuery) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid search query");
  }

  if (entityType === SEARCH_ENTITIES.PRODUCT) {
    const mongoQuery = await buildProductSearchQuery(normalizedQuery);

    const {
      items,
      similarItems,
      totalMatched,
      usedFallback,
      fallbackReason,
    } = await findDocumentsWithFallback({
      model: config.model,
      mongoQuery,
      normalizedQuery,
      searchableFields: config.searchableFields,
      populate: config.populate,
      sort: config.sort,
      page: pageNum,
      limit: limitNum,
      baseFilter,
    });

    const finalItems = usedFallback ? similarItems : items;

    let wishlistSet = new Set();

    if (req.user?._id) {
      const wishlistDoc = await Wishlist.findOne({ user: req.user._id }).select(
        "products"
      );

      wishlistSet = new Set(
        (wishlistDoc?.products || []).map((id) => id.toString())
      );
    }

    const updatedItems = finalItems.map((product) => {
      const p = product.toObject ? product.toObject() : product;

      return {
        ...p,
        isWishlisted: wishlistSet.has(product._id.toString()),
      };
    });

    const aiReply = await generateGenericSearchAiReply({
      entityLabel,
      inputType,
      extractedQuery: normalizedQuery,
      matchCount: updatedItems.length,
      usedFallback,
    });

    return {
      extractedQuery: normalizedQuery,
      inputType,
      aiReply,
      fallbackUsed: usedFallback,
      matchedItems: updatedItems,
      pagination: {
        total: usedFallback ? updatedItems.length : totalMatched,
        page: pageNum,
        limit: limitNum,
      },
    };
  }

  if (entityType === SEARCH_ENTITIES.CART) {
    if (!req.user?._id) {
      throw new AppError(httpStatus.UNAUTHORIZED, "User not authenticated");
    }

    const cartDoc = await config.model
      .findOne({ user: req.user._id })
      .populate(config.populate);

    const filterItems = buildCartSearchFilter(normalizedQuery);
    const matchedItems = cartDoc ? filterItems(cartDoc) : [];

    const aiReply = await generateGenericSearchAiReply({
      entityLabel,
      inputType,
      extractedQuery: normalizedQuery,
      matchCount: matchedItems.length,
      usedFallback: false,
    });

    return {
      extractedQuery: normalizedQuery,
      inputType,
      aiReply,
      fallbackUsed: false,
      matchedItems,
      pagination: {
        total: matchedItems.length,
        page: 1,
        limit: matchedItems.length,
      },
    };
  }

  const mongoQuery = buildGenericSearchQuery(
    normalizedQuery,
    config.searchableFields
  );

  const {
    items,
    similarItems,
    totalMatched,
    usedFallback,
    fallbackReason,
  } = await findDocumentsWithFallback({
    model: config.model,
    mongoQuery,
    normalizedQuery,
    searchableFields: config.searchableFields,
    populate: config.populate,
    sort: config.sort,
    page: pageNum,
    limit: limitNum,
    baseFilter,
  });

  const finalItems = usedFallback ? similarItems : items;

  const aiReply = await generateGenericSearchAiReply({
    entityLabel,
    inputType,
    extractedQuery: normalizedQuery,
    matchCount: finalItems.length,
    usedFallback,
    fallbackReason,
  });

  return {
    extractedQuery: normalizedQuery,
    inputType,
    aiReply,
    fallbackUsed: usedFallback,
    matchedItems: finalItems,
    pagination: {
      total: usedFallback ? finalItems.length : totalMatched,
      page: pageNum,
      limit: limitNum,
    },
  };
};