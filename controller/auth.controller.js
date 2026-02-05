import AppError from "../errors/AppError.js";
import { createToken, verifyToken } from "../utils/authToken.js";
import catchAsync from "../utils/catchAsync.js";
import {
  generateOTP,
  hashOTP,
  isOtpExpired,
  sendOTP,
} from "../utils/commonMethod.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { sendEmail } from "../utils/sendEmail.js";
import { User } from "./../model/user.model.js";

export const register = catchAsync(async (req, res, next) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return next(new AppError(400, "Name, email and password are required"));
  }

  // Check existing user
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError(409, "Email already registered"));
  }

  const user = await User.create({
    name,
    email,
    password,
    role: role || "user",
    isEmailVerified: true,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message:
      role === "user"
        ? "Registration successful. You can now log in."
        : "Registration successful as a seller. Please wait for admin approval.",
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      managerStatus: user.managerStatus,
    },
  });
});

export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError(400, "Email and password are required"));
  }

  // Explicitly select password
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return next(new AppError(404, "User not found"));
  }

  const isPasswordValid = await User.isPasswordMatched(password, user.password);

  if (!isPasswordValid) {
    return next(new AppError(401, "Invalid email or password"));
  }

  if (!user.isEmailVerified) {
    return next(
      new AppError(403, "Email not verified. Please verify your email."),
    );
  }

  if (user.role === "seller" && user.vendorStatus === "pending") {
    return next(
      new AppError(
        403,
        "Your seller status is pending. Please wait for admin approval.",
      ),
    );
  }

  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  };

  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN,
  );

  const refreshToken = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN,
  );

  // Save refresh token in DB
  user.refreshToken = refreshToken;
  await user.save();

  // Secure cookie
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Login successful",
    data: {
      accessToken,
      refreshToken,
      name: user.name,
      email: user.email,
      role: user.role,
      _id: user._id,
    },
  });
});

// export const register = catchAsync(async (req, res) => {
//   const { name, email, role, password, confirmPassword } = req.body;

//   if (!email || !password) {
//     throw new AppError(httpStatus.FORBIDDEN, "Please fill in all fields");
//   }

//   if (password !== confirmPassword) {
//     throw new AppError(
//       httpStatus.FORBIDDEN,
//       "Password and confirm password do not match"
//     );
//   }
//   const checkUser = await User.findOne({ email: email });
//   if (checkUser)
//     throw new AppError(
//       httpStatus.BAD_REQUEST,
//       "Email already exists, please try another email"
//     );

//   const user = await User.create({
//     name,
//     email,
//     password,
//     verificationInfo: { token: "", verified: true },
//     role,
//     vendorStatus: role === "seller" ? "pending" : undefined,
//   });

//   const jwtPayload = {
//     _id: user._id,
//     email: user.email,
//     role: user.role,
//   };
//   const accessToken = createToken(
//     jwtPayload,
//     process.env.JWT_ACCESS_SECRET,
//     process.env.JWT_ACCESS_EXPIRES_IN
//   );

//   const refreshToken = createToken(
//     jwtPayload,
//     process.env.JWT_REFRESH_SECRET,
//     process.env.JWT_REFRESH_EXPIRES_IN
//   );
//   user.refreshToken = refreshToken;
//   await user.save();
//   user.accessToken = accessToken;

//   const userObj = user.toObject();
//   userObj.accessToken = accessToken;

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "User registered successfully",
//     data: userObj,
//   });
// });

// export const login = catchAsync(async (req, res) => {
//   const { email, password } = req.body;
//   const user = await User.isUserExistsByEmail(email);
//   if (!user) {
//     throw new AppError(httpStatus.NOT_FOUND, "User not found");
//   }
//   if (
//     user?.password &&
//     !(await User.isPasswordMatched(password, user.password))
//   ) {
//     throw new AppError(httpStatus.FORBIDDEN, "Password is not correct");
//   }
//   if (!(await User.isOTPVerified(user._id))) {
//     const otp = generateOTP();
//     const jwtPayloadOTP = {
//       otp: otp,
//     };

//     const otptoken = createToken(
//       jwtPayloadOTP,
//       process.env.OTP_SECRET,
//       process.env.OTP_EXPIRE
//     );
//     user.verificationInfo.token = otptoken;
//     await user.save();
//     await sendEmail(user.email, "Registerd Account", `Your OTP is ${otp}`);

//     return sendResponse(res, {
//       statusCode: httpStatus.FORBIDDEN,
//       success: false,
//       message: "OTP is not verified, please verify your OTP",
//       data: { email: user.email },
//     });
//   }
//   const jwtPayload = {
//     _id: user._id,
//     email: user.email,
//     role: user.role,
//   };
//   const accessToken = createToken(
//     jwtPayload,
//     process.env.JWT_ACCESS_SECRET,
//     process.env.JWT_ACCESS_EXPIRES_IN
//   );

//   const refreshToken = createToken(
//     jwtPayload,
//     process.env.JWT_REFRESH_SECRET,
//     process.env.JWT_REFRESH_EXPIRES_IN
//   );

//   user.refreshToken = refreshToken;
//   let _user = await user.save();

//   res.cookie("refreshToken", refreshToken, {
//     secure: true,
//     httpOnly: true,
//     sameSite: "none",
//     maxAge: 1000 * 60 * 60 * 24 * 365,
//   });

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "User Logged in successfully",
//     data: {
//       accessToken,
//       refreshToken: refreshToken,
//       role: user.role,
//       _id: user._id,
//       user: user,
//     },
//   });
// });

export const forgetPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError(400, "Email is required"));
  }

  const user = await User.findOne({ email });
  if (!user) return next(new AppError(404, "User not found"));

  const now = Date.now();
  const lastSent = user.otp?.lastSentAt ? user.otp.lastSentAt.getTime() : 0;

  if (now - lastSent < 60 * 1000) {
    return next(new AppError(429, "Please wait before requesting another OTP"));
  }

  const rawOtp = generateOTP(6);

  user.otp = {
    hash: hashOTP(rawOtp),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    purpose: "reset_password",
    attempts: 0,
    lastSentAt: new Date(),
  };

  await user.save();

  await sendEmail(
    user.email,
    "Reset Password",
    `Your password reset OTP is ${rawOtp}`,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "OTP sent to your email successfully",
    data: null,
  });
});

export const resetPassword = catchAsync(async (req, res, next) => {
  const { email, otp, password, confirmPassword } = req.body;

  if (!email || !otp || !password) {
    return next(new AppError(400, "Email, OTP and password are required"));
  }

  if (password !== confirmPassword) {
    return next(new AppError(400, "Passwords do not match"));
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) return next(new AppError(404, "User not found"));

  if (
    !user.otp?.hash ||
    user.otp.purpose !== "reset_password" ||
    isOtpExpired(user.otp.expiresAt)
  ) {
    return next(new AppError(400, "OTP is invalid or expired"));
  }

  if (user.otp.attempts >= 5) {
    return next(new AppError(429, "Too many attempts. Request a new OTP."));
  }

  const isValid = hashOTP(otp) === user.otp.hash;
  user.otp.attempts += 1;

  if (!isValid) {
    await user.save();
    return next(new AppError(400, "Invalid OTP"));
  }

  user.password = password;

  user.otp = {
    hash: "",
    expiresAt: null,
    purpose: null,
    attempts: 0,
    lastSentAt: null,
  };

  await user.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Password reset successfully",
    data: null,
  });
});

export const verifyOTP = catchAsync(async (req, res, next) => {
  const { email, otp, purpose } = req.body;

  if (!email || !otp || !purpose) {
    return next(new AppError(400, "Email, OTP and purpose are required"));
  }

  const user = await User.findOne({ email });
  if (!user) return next(new AppError(404, "User not found"));

  if (
    !user.otp?.hash ||
    user.otp.purpose !== purpose ||
    isOtpExpired(user.otp.expiresAt)
  ) {
    return next(new AppError(400, "Invalid or expired OTP"));
  }

  if (user.otp.attempts >= 5) {
    return next(new AppError(429, "Too many attempts. Request a new OTP."));
  }

  const isValid = hashOTP(otp) === user.otp.hash;
  user.otp.attempts += 1;

  if (!isValid) {
    await user.save();
    return next(new AppError(400, "Invalid OTP"));
  }

  if (purpose === "verify_email") {
    user.isEmailVerified = true;
  }

  await user.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message:
      purpose === "verify_email"
        ? "Email verified successfully"
        : "OTP verified successfully",
    data: { email },
  });
});

export const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Old password and new password are required",
    );
  }
  if (oldPassword === newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Old password and new password cannot be same",
    );
  }
  const user = await User.findById({ _id: req.user?._id });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  user.password = newPassword;
  await user.save();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed",
    data: "",
  });
});

export const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError(400, "Refresh token is required");
  }

  const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(decoded._id);
  if (!user || user.refreshToken !== refreshToken) {
    throw new AppError(401, "Invalid refresh token");
  }
  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  };

  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN,
  );

  const refreshToken1 = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN,
  );
  user.refreshToken = refreshToken1;
  await user.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Token refreshed successfully",
    data: { accessToken: accessToken, refreshToken: refreshToken1 },
  });
});

export const logout = catchAsync(async (req, res) => {
  const user = req.user?._id;
  const user1 = await User.findByIdAndUpdate(
    user,
    { refreshToken: "" },
    { new: true },
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Logged out successfully",
    data: "",
  });
});
