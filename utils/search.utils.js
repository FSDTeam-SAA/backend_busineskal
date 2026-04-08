import { GoogleGenAI } from "@google/genai";
import AppError from "../errors/AppError.js";
import httpStatus from "http-status";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

export const detectSearchInputType = ({ text, files, file }) => {
  const hasText = typeof text === "string" && text.trim();

  const hasVoice =
    files?.voice?.length > 0 ||
    files?.audio?.length > 0 ||
    file?.mimetype?.startsWith("audio/");

  const hasImage =
    files?.image?.length > 0 ||
    files?.photo?.length > 0 ||
    file?.mimetype?.startsWith("image/");

  const count = [!!hasText, !!hasVoice, !!hasImage].filter(Boolean).length;

  if (count === 0) return null;

  if (count > 1) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please send only one input type at a time: text, voice, or image"
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

export const escapeRegex = (value = "") => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const getSearchTerms = (query = "") => {
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

export const extractQueryFromVoice = async ({
  voiceFile,
  entityLabel = "item",
}) => {
  try {
    if (!genAI) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "GEMINI_API_KEY is missing. Voice search is not configured"
      );
    }

    const prompt = `
You are a search extraction assistant.

Task:
1. Listen to the audio.
2. Extract the user's intended ${entityLabel} search query.
3. Return ONLY a short searchable query.
4. No explanation.
5. Keep important details if mentioned.
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
      `Voice processing failed: ${error.message}`
    );
  }
};

export const extractQueryFromImage = async ({
  imageFile,
  entityLabel = "item",
}) => {
  try {
    if (!genAI) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "GEMINI_API_KEY is missing. Image search is not configured"
      );
    }

    const prompt = `
You are a search detection assistant.

Task:
1. Look at the image.
2. Identify the ${entityLabel} or most likely searchable keyword.
3. Return ONLY a short searchable query.
4. No explanation.
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
      `Image processing failed: ${error.message}`
    );
  }
};

export const generateGenericSearchAiReply = async ({
  entityLabel,
  inputType,
  extractedQuery,
  matchCount,
  usedFallback,
}) => {
  if (matchCount === 0) {
    return `No ${entityLabel} found for "${extractedQuery}".`;
  }

  if (usedFallback) {
    return `No exact ${entityLabel} match found for "${extractedQuery}", but similar results were found.`;
  }

  if (inputType === "voice") {
    return `Found ${matchCount} matching ${entityLabel}${matchCount > 1 ? "s" : ""} from your voice search.`;
  }

  if (inputType === "image") {
    return `Found ${matchCount} matching ${entityLabel}${matchCount > 1 ? "s" : ""} from your image search.`;
  }

  return `Found ${matchCount} matching ${entityLabel}${matchCount > 1 ? "s" : ""} for "${extractedQuery}".`;
};