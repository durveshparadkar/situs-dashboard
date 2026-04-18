import { Request, Response } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import { z } from "zod";
import User from "./auth.model.js";
import Organization from "../organizations/organization.model.js";
import { asyncHandler } from "../../shared/utils/asynchandler.js";

/* ================= VALIDATION SCHEMAS ================= */

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

/* ================= TOKEN GENERATOR ================= */

function generateToken(
  userId: string,
  role: string,
  organizationId: string
): string {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing in environment variables");
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "15m";

  const options: SignOptions = {
    expiresIn: expiresIn as SignOptions["expiresIn"],
  };

  return jwt.sign(
    {
      id: userId,
      role: role,
      organizationId: organizationId,
    },
    process.env.JWT_SECRET,
    options
  );
}

/* ================= TOKEN RESPONSE ================= */

function sendTokenResponse(
  res: Response,
  token: string,
  statusCode: number,
  user: any,
  organization?: any
) {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 15 * 60 * 1000,
  });

  res.status(statusCode).json({
    success: true,
    token,
    user,
    organization,
  });
}

/* ================= REGISTER ================= */

export const register = asyncHandler(
  async (req: Request, res: Response) => {
    const validatedData = registerSchema.parse(req.body);
    const name = validatedData.name;
    const email = validatedData.email;
    const password = validatedData.password;

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    const userCount = await User.countDocuments();
    const role = userCount === 0 ? "SUPER_ADMIN" : "ORG_ADMIN";

    const user = await User.create({
      name: name,
      email: normalizedEmail,
      password: password,
      role: role,
    });

    const organization = await Organization.create({
      name: name + " Organization",
      plan: "SMALL_BUSINESS",
    });

    user.organizationId = organization._id;
    await user.save();

    const token = generateToken(
      user._id.toString(),
      user.role,
      organization._id.toString()
    );

    sendTokenResponse(
      res,
      token,
      201,
      {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      organization
    );
  }
);

/* ================= LOGIN ================= */

export const login = asyncHandler(
  async (req: Request, res: Response) => {
    const validatedData = loginSchema.parse(req.body);
    const email = validatedData.email;
    const password = validatedData.password;

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.organizationId) {
      return res.status(400).json({
        success: false,
        message: "User has no organization assigned",
      });
    }

    const organization = await Organization.findById(
      user.organizationId
    );

    const token = generateToken(
      user._id.toString(),
      user.role,
      user.organizationId.toString()
    );

    sendTokenResponse(
      res,
      token,
      200,
      {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      organization
    );
  }
);

/* ================= LOGOUT ================= */

export const logout = asyncHandler(
  async (_req: Request, res: Response) => {
    res.cookie("token", "", {
      httpOnly: true,
      expires: new Date(0),
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  }
);

/* ================= PROFILE ================= */

export const getProfile = asyncHandler(
  async (req: any, res: Response) => {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  }
);












