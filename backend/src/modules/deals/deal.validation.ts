export const validateCreateDeal = (data: any) => {
  if (!data.title) throw new Error("Title is required");
  if (!data.value) throw new Error("Value is required");
  if (!data.pipelineId) throw new Error("Pipeline is required");
};

export const validateUpdateDeal = (data: any) => {
  if (data.value && data.value < 0) {
    throw new Error("Invalid value");
  }
};