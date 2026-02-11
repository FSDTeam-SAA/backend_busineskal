import { Product } from "../model/product.model.js";
import { Order } from "../model/order.model.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import mongoose from "mongoose";

// Admin commission percentage
const ADMIN_COMMISSION_RATE = 0.0499; // 4.99%

// Get seller dashboard overview
export const getSellerDashboardOverview = catchAsync(async (req, res, next) => {
  const sellerId = req.user._id; // Assuming auth middleware adds user to req
  const { period = "month" } = req.query; // day, week, month, year

  // Get total sell count from completed orders
  const totalSellResult = await Order.aggregate([
    {
      $match: {
        vendor: new mongoose.Types.ObjectId(sellerId),
        status: "delivered",
      },
    },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);
  const totalSell = totalSellResult.length > 0 ? totalSellResult[0].total : 0;

  // Get live product count
  const liveProductCount = await Product.countDocuments({
    vendor: sellerId,
    verified: true,
    status: { $ne: "out_of_stock" },
  });

  // Get sell report data
  const sellReportData = await getSellReportData(sellerId, period);

  // Get new products report
  const newProductsReport = await getNewProductsReport(sellerId, period);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Seller dashboard overview retrieved successfully",
    data: {
      overview: {
        totalSell,
        liveProductCount,
      },
      sellReport: sellReportData,
      newProductsReport,
    },
  });
});

// Helper function to get sell report data
const getSellReportData = async (sellerId, period) => {
  let groupBy, startDate;
  const now = new Date();

  switch (period) {
    case "day":
      groupBy = { $hour: "$createdAt" };
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case "week":
      groupBy = { $dayOfWeek: "$createdAt" };
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case "year":
      groupBy = { $month: "$createdAt" };
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case "month":
    default:
      groupBy = { $dayOfMonth: "$createdAt" };
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const thisMonthSales = await Order.aggregate([
    {
      $match: {
        vendor: new mongoose.Types.ObjectId(sellerId),
        status: "delivered",
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: groupBy,
        sales: { $sum: "$totalAmount" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Get last period data
  let lastPeriodStart, lastPeriodEnd;
  if (period === "month") {
    lastPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    lastPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (period === "week") {
    lastPeriodStart = new Date(now.setDate(now.getDate() - 14));
    lastPeriodEnd = new Date(now.setDate(now.getDate() - 7));
  } else if (period === "year") {
    lastPeriodStart = new Date(now.getFullYear() - 1, 0, 1);
    lastPeriodEnd = new Date(now.getFullYear() - 1, 11, 31);
  } else {
    lastPeriodStart = new Date(now.setDate(now.getDate() - 1));
    lastPeriodEnd = new Date(now);
  }

  const lastMonthSales = await Order.aggregate([
    {
      $match: {
        vendor: new mongoose.Types.ObjectId(sellerId),
        status: "delivered",
        createdAt: { $gte: lastPeriodStart, $lte: lastPeriodEnd },
      },
    },
    {
      $group: {
        _id: groupBy,
        sales: { $sum: "$totalAmount" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    thisMonth: thisMonthSales,
    lastMonth: lastMonthSales,
    period,
  };
};

// Helper function to get new products report
const getNewProductsReport = async (sellerId, period) => {
  let startDate;
  const now = new Date();

  switch (period) {
    case "day":
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case "week":
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case "month":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisDay = await Product.countDocuments({
    vendor: sellerId,
    createdAt: { $gte: today },
  });

  const thisWeek = await Product.countDocuments({
    vendor: sellerId,
    createdAt: { $gte: weekStart },
  });

  const thisMonth = await Product.countDocuments({
    vendor: sellerId,
    createdAt: { $gte: monthStart },
  });

  return {
    thisDay,
    thisWeek,
    thisMonth,
    period,
  };
};

// Get seller sales history
export const getSellerSalesHistory = catchAsync(async (req, res, next) => {
  const sellerId = req.user._id;
  const { page = 1, limit = 10, search } = req.query;

  // Find all completed orders for this seller
  const orderFilter = {
    vendor: sellerId,
    status: "delivered",
  };

  const orders = await Order.find(orderFilter)
    .populate("items.product", "title photos sku")
    .populate("customer", "firstName lastName")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .lean();

  // Calculate sales data for each order
  const salesData = await Promise.all(
    orders.map(async (order) => {
      // Get product details from order items
      const products = order.items.map((item) => ({
        productId: item.product?._id,
        productName: item.product?.title,
        productImage: item.product?.photos?.[0]?.url,
        quantity: item.quantity,
        price: item.price,
      }));

      // Calculate amounts
      const totalSellAmount = order.totalAmount;
      const adminCharge = totalSellAmount * ADMIN_COMMISSION_RATE;
      const myRevenue = totalSellAmount - adminCharge;

      return {
        orderId: order.orderId,
        products,
        quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
        date: order.createdAt,
        totalSellAmount: totalSellAmount.toFixed(2),
        adminCharge: adminCharge.toFixed(2),
        myRevenue: myRevenue.toFixed(2),
        customer: order.customer
          ? `${order?.customer?.firstName} ${order?.customer?.lastName}`
          : "N/A",
      };
    }),
  );

  // Calculate total sales
  const totalSalesResult = await Order.aggregate([
    { $match: orderFilter },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);
  const totalSales =
    totalSalesResult.length > 0 ? totalSalesResult[0].total : 0;

  const total = await Order.countDocuments(orderFilter);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Sales history retrieved successfully",
    data: {
      totalSales: totalSales.toFixed(2),
      sales: salesData,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});
