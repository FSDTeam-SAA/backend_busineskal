import { escapeRegex, getSearchTerms } from "./search.utils.js";

export const applyPopulate = (query, populate = []) => {
  let finalQuery = query;

  for (const item of populate) {
    finalQuery = finalQuery.populate(item);
  }

  return finalQuery;
};

export const findDocumentsWithFallback = async ({
  model,
  mongoQuery,
  normalizedQuery,
  searchableFields = [],
  populate = [],
  sort = { createdAt: -1 },
  page = 1,
  limit = 10,
  baseFilter = {},
}) => {
  const skip = (page - 1) * limit;

  let query = model.find({
    ...baseFilter,
    ...mongoQuery,
  });

  query = applyPopulate(query, populate);

  const docs = await query.sort(sort).skip(skip).limit(limit);

  const totalMatched = await model.countDocuments({
    ...baseFilter,
    ...mongoQuery,
  });

  if (docs.length > 0) {
    return {
      items: docs,
      similarItems: [],
      totalMatched,
      usedFallback: false,
      fallbackReason: null,
    };
  }

  const terms = getSearchTerms(normalizedQuery);
  const fallbackOr = [];

  for (const term of terms) {
    const safeTerm = escapeRegex(term);

    for (const field of searchableFields) {
      fallbackOr.push({
        [field]: { $regex: safeTerm, $options: "i" },
      });
    }
  }

  if (!fallbackOr.length && searchableFields.length > 0) {
    fallbackOr.push({
      [searchableFields[0]]: {
        $regex: escapeRegex(normalizedQuery),
        $options: "i",
      },
    });
  }

  if (!fallbackOr.length) {
    return {
      items: [],
      similarItems: [],
      totalMatched: 0,
      usedFallback: true,
      fallbackReason: "No exact or similar result found",
    };
  }

  let fallbackQuery = model.find({
    ...baseFilter,
    $or: fallbackOr,
  });

  fallbackQuery = applyPopulate(fallbackQuery, populate);

  const similarItems = await fallbackQuery.sort(sort).limit(limit);

  return {
    items: [],
    similarItems,
    totalMatched: 0,
    usedFallback: true,
    fallbackReason:
      similarItems.length > 0
        ? "No exact match found, returned similar results"
        : "No exact or similar result found",
  };
};