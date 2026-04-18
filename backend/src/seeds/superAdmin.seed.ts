export const success = (data: any, message = "Success") => ({
  success: true,
  message,
  data,
});

export const failure = (message: string, code = 400) => ({
  success: false,
  message,
  code,
});
