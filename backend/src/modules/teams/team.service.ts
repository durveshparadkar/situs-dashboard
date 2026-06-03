import mongoose from "mongoose";
import Team from "./team.model.js";
import Membership from "../memberships/membership.model.js";
import User from "../users/user.model.js";

/* ================= TYPES ================= */

interface CurrentUser {
  _id: string;
  organizationId: string;
  role: "SUPER_ADMIN" | "ORG_ADMIN" | "MANAGER" | "AGENT" | "USER";
}

interface CreateTeamInput {
  name: string;
  members?: string[];
  managerId?: string;
}

interface UpdateTeamInput {
  name?: string;
  members?: string[];
  managerId?: string | null;
}

/* ================= HELPERS ================= */

function toObjectId(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

/* ======================================================
   🚀 TEAM SERVICE
====================================================== */

class TeamService {
  /* ================= CREATE ================= */

  async create(data: CreateTeamInput, currentUser: CurrentUser) {
    const session = await mongoose.startSession();

    try {
      let createdTeam!: mongoose.Document;

      await session.withTransaction(async () => {
        const orgId = toObjectId(currentUser.organizationId);
        const creatorId = toObjectId(currentUser._id);

        const memberIds = (data.members || []).map(toObjectId);

        /* ================= VALIDATION ================= */

        // Ensure all members belong to same org
        const users = await User.find({
          _id: { $in: memberIds },
          organizationId: orgId,
        }).session(session);

        if (users.length !== memberIds.length) {
          throw new Error("Invalid members (cross-org detected)");
        }

        /* ================= CREATE TEAM ================= */

        const createdTeams = await Team.create(
          [
            {
              name: data.name,
              organizationId: orgId,
              createdBy: creatorId,
              managerId: data.managerId
                ? toObjectId(data.managerId)
                : null,
              members: memberIds,
            },
          ],
          { session }
        );

        const team = createdTeams[0];
        if (!team) {
          throw new Error("Failed to create team");
        }

        createdTeam = team;

        /* ================= MEMBERSHIP SYNC ================= */

        if (memberIds.length) {
          const memberships = memberIds.map((userId) => ({
            userId,
            teamId: createdTeam._id,
            role: "USER",
          }));

          await Membership.insertMany(memberships, { session });
        }
      });

      return createdTeam;
    } finally {
      session.endSession();
    }
  }

  /* ================= GET ALL ================= */

  async getAll(currentUser: CurrentUser) {
    return Team.find({
      organizationId: toObjectId(currentUser.organizationId),
      isActive: true,
    })
      .populate("managerId", "email")
      .sort({ createdAt: -1 })
      .lean();
  }

  /* ================= GET ONE ================= */

  async getById(teamId: string, currentUser: CurrentUser) {
    const team = await Team.findOne({
      _id: toObjectId(teamId),
      organizationId: toObjectId(currentUser.organizationId),
    }).populate("members managerId");

    if (!team) {
      throw new Error("Team not found");
    }

    return team;
  }

  /* ================= UPDATE ================= */

  async update(
    teamId: string,
    data: UpdateTeamInput,
    currentUser: CurrentUser
  ) {
    const session = await mongoose.startSession();

    try {
      let updatedTeam;

      await session.withTransaction(async () => {
        const team = await Team.findOne({
          _id: toObjectId(teamId),
          organizationId: toObjectId(currentUser.organizationId),
        }).session(session);

        if (!team) throw new Error("Team not found");

        /* ================= UPDATE FIELDS ================= */

        if (data.name) team.name = data.name;

        if (data.managerId !== undefined) {
          team.managerId = data.managerId
            ? toObjectId(data.managerId)
            : null;
        }

        /* ================= MEMBER UPDATE ================= */

        if (data.members) {
          const newMembers = data.members.map(toObjectId);

          // Validate org
          const users = await User.find({
            _id: { $in: newMembers },
            organizationId: team.organizationId,
          }).session(session);

          if (users.length !== newMembers.length) {
            throw new Error("Invalid members");
          }

          // 🔥 Remove old memberships
          await Membership.deleteMany(
            { teamId: team._id },
            { session }
          );

          // 🔥 Add new memberships
          await Membership.insertMany(
            newMembers.map((userId) => ({
              userId,
              teamId: team._id,
              role: "USER",
            })),
            { session }
          );

          team.members = newMembers;
        }

        await team.save({ session });

        updatedTeam = team;
      });

      return updatedTeam;
    } finally {
      session.endSession();
    }
  }

  /* ================= DELETE (SOFT) ================= */

  async remove(teamId: string, currentUser: CurrentUser) {
    const team = await Team.findOne({
      _id: toObjectId(teamId),
      organizationId: toObjectId(currentUser.organizationId),
    });

    if (!team) throw new Error("Team not found");

    team.isActive = false;
    await team.save();

    // 🔥 Cleanup memberships
    await Membership.deleteMany({ teamId: team._id });

    return { success: true };
  }

  /* ================= ADD MEMBER ================= */

  async addMember(
    teamId: string,
    userId: string,
    currentUser: CurrentUser
  ) {
    const team = await Team.findOne({
      _id: toObjectId(teamId),
      organizationId: toObjectId(currentUser.organizationId),
    });

    if (!team) throw new Error("Team not found");

    const user = await User.findOne({
      _id: toObjectId(userId),
      organizationId: team.organizationId,
    });

    if (!user) throw new Error("User not found");

    if (team.members.some((m) => m.equals(user._id))) {
      return team; // already exists
    }

    team.members.push(user._id);
    await team.save();

    await Membership.create({
      userId: user._id,
      teamId: team._id,
      role: "USER",
    });

    return team;
  }

  /* ================= REMOVE MEMBER ================= */

  async removeMember(
    teamId: string,
    userId: string,
    currentUser: CurrentUser
  ) {
    const team = await Team.findOne({
      _id: toObjectId(teamId),
      organizationId: toObjectId(currentUser.organizationId),
    });

    if (!team) throw new Error("Team not found");

    team.members = team.members.filter(
      (m) => !m.equals(userId)
    );

    await team.save();

    await Membership.deleteOne({
      userId: toObjectId(userId),
      teamId: team._id,
    });

    return team;
  }
}

export default new TeamService();