export const getErrorMessage = (err) => {
  if (!err) return "Something went wrong";

  if (typeof err === "string") return err;

  if (err.error) return err.error;

  if (err.message) return err.message;

  if (err.detail) return err.detail;

  return "Something went wrong";
};

export const isNetworkError = (err) => {
  return err?.name === "AbortError" || err?.message === "Failed to fetch";
};