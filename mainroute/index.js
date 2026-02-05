import express from "express";

import authRoute from "../route/auth.route.js";
import userRoute from "../route/user.route.js";
import categoryRoute from "../route/product.category.route.js";
import productRoute from "../route/product.route.js";
import cartRoute from "../route/cart.route.js";
import wishlistRoute from "../route/wishlist.route.js";
import orderRoute from "../route/order.route.js";
import paymentRoute from "../route/payment.route.js";
import addressRoute from "../route/address.route.js";
import couponRoute from "../route/coupon.route.js";
import contactUsRoute from "../route/contactUs.route.js";
import reviewsRoute from "../route/review.route.js";

const router = express.Router();

// Mounting the routes
router.use("/auth", authRoute);
router.use("/user", userRoute);
router.use("/category", categoryRoute);
router.use("/product", productRoute);
router.use("/cart", cartRoute);
router.use("/wishlist", wishlistRoute);
router.use("/order", orderRoute);
router.use("/payment", paymentRoute);
router.use("/address", addressRoute);
router.use("/coupon", couponRoute);
router.use("/contact-us", contactUsRoute);
router.use("/reviews", reviewsRoute);

export default router;
