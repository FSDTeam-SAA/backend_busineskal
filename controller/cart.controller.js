import httpStatus from "http-status";
import { Cart as CartModel } from "../model/cart.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Product } from "../model/product.model.js";

export const addToCart = catchAsync(async (req, res) => {
  const { product, quantity = 1 } = req.body;
  const user = req.user._id;

  let cart = await CartModel.findOne({ user });

  const prod = await Product.findById(product);
  if (!prod || prod.stock < quantity) {
    throw new AppError(httpStatus.BAD_REQUEST, "Product unavailable");
  }

  if (!cart) {
    cart = await CartModel.create({ user, items: [{ product, quantity }] });
  } else {
    const existingItem = cart.items.find(
      (item) => item.product.toString() === product
    );
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({ product, quantity });
    }
  }

  // Recalculate total
  let total = 0;
  for (let item of cart.items) {
    const p = await Product.findById(item.product);
    total += p.price * item.quantity;
  }
  cart.totalAmount = total;
  await cart.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Added to cart",
    data: cart,
  });
});

export const getCart = catchAsync(async (req, res) => {
  const cart = await CartModel.findOne({ user: req.user._id }).populate(
    "items.product",
    "title price photos stock"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cart fetched",
    data: cart || { items: [], totalAmount: 0 },
  });
});

export const updateCart = catchAsync(async (req, res) => {
  const { product, quantity } = req.body;
  const cart = await CartModel.findOne({ user: req.user._id });

  if (!cart) throw new AppError(httpStatus.NOT_FOUND, "Cart not found");

  const item = cart.items.find((i) => i.product.toString() === product);
  if (!item) throw new AppError(httpStatus.NOT_FOUND, "Item not in cart");

  item.quantity = quantity;
  if (quantity <= 0) {
    cart.items = cart.items.filter((i) => i.product.toString() !== product);
  }

  // Recalculate total (similar to add)
  let total = 0;
  for (let item of cart.items) {
    const p = await Product.findById(item.product);
    total += p.price * item.quantity;
  }
  cart.totalAmount = total;
  await cart.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cart updated",
    data: cart,
  });
});

export const clearCart = catchAsync(async (req, res) => {
  await CartModel.findOneAndUpdate(
    { user: req.user._id },
    { items: [], totalAmount: 0 }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cart cleared",
    data: { items: [], totalAmount: 0 },
  });
});
