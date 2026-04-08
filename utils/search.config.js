import { Product } from "../model/product.model.js";
import { Category } from "../model/category.model.js";
import { Service } from "../model/service.model.js";
import { Chat } from "../model/chat.model.js";
import { Cart } from "../model/cart.model.js";
import { Shop } from "../model/shop.model.js"; // 🔥 supplier এর বদলে এটা

export const SEARCH_ENTITIES = {
  PRODUCT: "product",
  SUPPLIER: "supplier", // actually shop
  SERVICE: "service",
  CATEGORY: "category",
  CHAT: "chat",
  CART: "cart",
};

export const SEARCH_CONFIG = {
  [SEARCH_ENTITIES.PRODUCT]: {
    model: Product,
    searchableFields: [
      "title",
      "description",
      "detailedDescription",
      "sku",
      "country",
    ],
    allowedInputs: ["text", "voice", "image"],
    populate: [
      { path: "category", select: "name path" },
      { path: "vendor", select: "name storeName" },
      { path: "shopId", select: "name description shopStatus" },
    ],
    sort: {
      verified: -1,
      soldCount: -1,
      rating: -1,
      createdAt: -1,
    },
  },

  // 🔥 supplier = shop
  [SEARCH_ENTITIES.SUPPLIER]: {
    model: Shop,
    searchableFields: [
      "name",
      "description",
      "address",
      "city",
      "country",
    ],
    allowedInputs: ["text", "voice", "image"],
    populate: [],
    sort: {
      createdAt: -1,
    },
  },

  [SEARCH_ENTITIES.SERVICE]: {
    model: Service,
    searchableFields: [
      "title",
      "description",
      "serviceType",
      "country",
    ],
    allowedInputs: ["text", "voice", "image"],
    populate: [
      { path: "category", select: "name path" },
    ],
    sort: {
      createdAt: -1,
    },
  },

  [SEARCH_ENTITIES.CATEGORY]: {
    model: Category,
    searchableFields: ["name", "path", "description"],
    allowedInputs: ["text", "voice"],
    populate: [],
    sort: {
      createdAt: -1,
    },
  },

  [SEARCH_ENTITIES.CHAT]: {
    model: Chat,
    searchableFields: ["groupName", "lastMessage"],
    allowedInputs: ["text", "voice"],
    populate: [{ path: "members", select: "name email" }],
    sort: {
      updatedAt: -1,
    },
  },

  [SEARCH_ENTITIES.CART]: {
    model: Cart,
    searchableFields: [],
    allowedInputs: ["text", "voice"],
    populate: [
      {
        path: "items.product",
        select: "title sku description price category",
      },
    ],
    sort: {
      updatedAt: -1,
    },
  },
};