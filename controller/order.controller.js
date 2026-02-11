import httpStatus from "http-status";
import { Order as OrderModel } from "../model/order.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { nanoid } from "nanoid";
import { Product } from "../model/product.model.js";

export const createOrder = catchAsync(async (req, res) => {
  const { items, address } = req.body;
  const customer = req.user._id;

  let totalAmount = 0;
  const orderItems = [];
  for (let item of items) {
    const product = await Product.findById(item.product.toString());

    if (!product || product.stock < item.quantity) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Insufficient stock for ${product?.title}`,
      );
    }
    totalAmount += product.price * item.quantity;
    orderItems.push({
      product: item.product,
      quantity: item.quantity,
      price: product.price,
      vendor: product.vendor,
    });

    // Update stock
    product.stock -= item.quantity;
    await product.save();
  }

  const orderId = `ORD${nanoid(6)}`;

  const order = await OrderModel.create({
    orderId,
    items: orderItems,
    totalAmount,
    customer,
    vendor: orderItems[0].vendor,
    address,
    expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Order created",
    data: order,
  });
});

export const getOrders = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const query = { customer: req.user._id };
  if (status) query.status = status;

  if (req.user.role === "seller") {
    query.vendor = req.user._id;
    delete query.customer;
  } else if (req.user.role === "admin") {
    delete query.customer;
  }

  const orders = await OrderModel.find(query)
    .populate("items.product", "title price photos")
    .populate("customer", "name email")
    .populate("vendor", "name storeName")
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Orders fetched",
    data: orders,
  });
});

export const getOrderById = catchAsync(async (req, res) => {
  const order = await OrderModel.findOne({ orderId: req.params.orderId })
    .populate("items.product", "title price photos")
    .populate("customer", "name email")
    .populate("vendor", "name storeName");

  if (!order) throw new AppError(httpStatus.NOT_FOUND, "Order not found");

  // Role check for access
  if (
    req.user.role === "user" &&
    order?.customer?._id.toString() !== req.user._id.toString()
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  } else if (
    req.user.role === "seller" &&
    order.vendor._id.toString() !== req.user._id.toString()
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Order fetched",
    data: order,
  });
});

export const updateOrderStatus = catchAsync(async (req, res) => {
  if (req.user.role !== "seller" && req.user.role !== "admin") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only managers/admins can update status",
    );
  }

  const { status, trackingNumber } = req.body;
  const order = await OrderModel.findOneAndUpdate(
    { orderId: req.params.orderId },
    { status, trackingNumber },
    { new: true },
  ).populate("items.product");

  if (!order || order.vendor.toString() !== req.user._id.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Order status updated",
    data: order,
  });
});

export const getMyOrders = catchAsync(async (req, res) => {
  const orders = await OrderModel.find({
    customer: req.user._id,
    status: { $in: ["in_progress", "shipped", "delivered"] },
  })
    .populate("items.product", "title price photos")
    .populate("customer", "name email")
    .populate("vendor", "name storeName");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Orders fetched",
    data: orders,
  });
});
