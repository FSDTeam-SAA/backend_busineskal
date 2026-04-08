import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { executeEntitySearch } from "../service/search.service.js";
import { SEARCH_ENTITIES } from "../utils/search.config.js";

export const searchProduct = catchAsync(async (req, res) => {
  const data = await executeEntitySearch({
    entityType: SEARCH_ENTITIES.PRODUCT,
    req,
    entityLabel: "product",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product search completed successfully",
    data: {
      extractedQuery: data.extractedQuery,
      inputType: data.inputType,
      aiReply: data.aiReply,
      fallbackUsed: data.fallbackUsed,
      matchedProducts: data.matchedItems,
      pagination: data.pagination,
    },
  });
});

export const searchSupplier = catchAsync(async (req, res) => {
  const data = await executeEntitySearch({
    entityType: SEARCH_ENTITIES.SUPPLIER,
    req,
    entityLabel: "supplier",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Supplier search completed successfully",
    data: {
      extractedQuery: data.extractedQuery,
      inputType: data.inputType,
      aiReply: data.aiReply,
      fallbackUsed: data.fallbackUsed,
      matchedSuppliers: data.matchedItems,
      pagination: data.pagination,
    },
  });
});

export const searchService = catchAsync(async (req, res) => {
  const data = await executeEntitySearch({
    entityType: SEARCH_ENTITIES.SERVICE,
    req,
    entityLabel: "service",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service search completed successfully",
    data: {
      extractedQuery: data.extractedQuery,
      inputType: data.inputType,
      aiReply: data.aiReply,
      fallbackUsed: data.fallbackUsed,
      matchedServices: data.matchedItems,
      pagination: data.pagination,
    },
  });
});

export const searchCategory = catchAsync(async (req, res) => {
  const data = await executeEntitySearch({
    entityType: SEARCH_ENTITIES.CATEGORY,
    req,
    entityLabel: "category",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Category search completed successfully",
    data: {
      extractedQuery: data.extractedQuery,
      inputType: data.inputType,
      aiReply: data.aiReply,
      fallbackUsed: data.fallbackUsed,
      matchedCategories: data.matchedItems,
      pagination: data.pagination,
    },
  });
});

export const searchCountry = catchAsync(async (req, res) => {
  const data = await executeEntitySearch({
    entityType: SEARCH_ENTITIES.COUNTRY,
    req,
    entityLabel: "country",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Country search completed successfully",
    data: {
      extractedQuery: data.extractedQuery,
      inputType: data.inputType,
      aiReply: data.aiReply,
      fallbackUsed: data.fallbackUsed,
      matchedCountries: data.matchedItems,
      pagination: data.pagination,
    },
  });
});

export const searchChat = catchAsync(async (req, res) => {
  const data = await executeEntitySearch({
    entityType: SEARCH_ENTITIES.CHAT,
    req,
    entityLabel: "chat",
    baseFilter: req.user?._id ? { members: req.user._id } : {},
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Chat search completed successfully",
    data: {
      extractedQuery: data.extractedQuery,
      inputType: data.inputType,
      aiReply: data.aiReply,
      fallbackUsed: data.fallbackUsed,
      matchedChats: data.matchedItems,
      pagination: data.pagination,
    },
  });
});

export const searchCart = catchAsync(async (req, res) => {
  const data = await executeEntitySearch({
    entityType: SEARCH_ENTITIES.CART,
    req,
    entityLabel: "cart item",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cart search completed successfully",
    data: {
      extractedQuery: data.extractedQuery,
      inputType: data.inputType,
      aiReply: data.aiReply,
      fallbackUsed: data.fallbackUsed,
      matchedCartItems: data.matchedItems,
      pagination: data.pagination,
    },
  });
});