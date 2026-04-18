import Entity from "./entity.model.js";

export const createEntityService = async (payload: any) => {
  return await Entity.create(payload);
};

export const getEntitiesService = async (orgId: string) => {
  return await Entity.find({ organizationId: orgId }).sort({ createdAt: -1 });
};


