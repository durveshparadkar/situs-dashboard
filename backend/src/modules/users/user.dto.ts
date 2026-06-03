import { Types } from "mongoose";

/* =====================================================
   BASE TYPES
===================================================== */

export type UserId = string;
export type ObjectIdLike = string | Types.ObjectId;

/* =====================================================
   CREATE USER DTO
===================================================== */

export interface CreateUserDTO {
  email: string;
  password: string;
  roleId: ObjectIdLike;
  managerId?: ObjectIdLike;
}

/* =====================================================
   UPDATE USER DTO
===================================================== */

export interface UpdateUserDTO {
  email?: string;
  roleId?: ObjectIdLike;
  managerId?: ObjectIdLike | null;
  isActive?: boolean;
}

/* =====================================================
   USER RESPONSE DTO (SAFE OUTPUT)
===================================================== */

export interface UserResponseDTO {
  _id: UserId;
  email: string;

  organizationId: UserId;

  roleId: UserId;

  managerId?: UserId | null;

  isActive: boolean;
  isEmailVerified: boolean;

  lastLoginAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

/* =====================================================
   PAGINATED RESPONSE DTO
===================================================== */

export interface PaginatedUsersDTO {
  data: UserResponseDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/* =====================================================
   CURRENT USER CONTEXT (SERVICE SAFE)
===================================================== */

export interface CurrentUserDTO {
  _id: UserId;
  organizationId: UserId;
  roleId: UserId;
}

/* =====================================================
   INTERNAL SAFE TYPES (OPTIONAL)
===================================================== */

// Used internally when password is required (e.g. login)
export interface UserWithPasswordDTO extends UserResponseDTO {
  password: string;
}