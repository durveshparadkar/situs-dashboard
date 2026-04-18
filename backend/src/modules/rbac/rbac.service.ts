import Permission from "../../modules/rbac/permission.model.js";

export const seedPermissions = async () => {
  const permissions = [
    "ENTITY_CREATE",
    "ENTITY_READ",
    "ENTITY_UPDATE",
    "ENTITY_DELETE",
    "ORG_MANAGE",
    "USER_MANAGE",
  ];

  for (const name of permissions) {
    await Permission.findOneAndUpdate(
      { name },
      { name },
      { upsert: true, new: true }
    );
  }

  console.log("✅ Permissions seeded");
};
