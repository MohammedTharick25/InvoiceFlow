import { ApiError } from "../utils/ApiError.js";

export function notFound(req, _res, next) {
  next(new ApiError(404, "NOT_FOUND", "The requested resource was not found."));
}

export function errorHandler(error, req, res, _next) {
  void _next;
  const status = error instanceof ApiError ? error.status : 500;
  const body = {
    error: {
      code: error instanceof ApiError ? error.code : "INTERNAL_ERROR",
      message:
        error instanceof ApiError
          ? error.message
          : "An unexpected error occurred.",
      requestId: req.id,
    },
  };
  if (error instanceof ApiError && error.details !== undefined)
    body.error.details = error.details;
  if (status >= 500)
    req.log?.error(
      {
        err: error,
        ...(error.emailProviderFailure
          ? {
              emailProviderFailure: error.emailProviderFailure,
              emailProviderStatus: error.emailProviderStatus,
              emailProviderCode: error.emailProviderCode,
            }
          : {}),
      },
      "Request failed",
    );
  res.status(status).json(body);
}
