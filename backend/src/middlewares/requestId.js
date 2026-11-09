import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.js";

export function requestId(req, res, next) {
  const supplied = req.get("x-request-id");
  const id =
    supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied)
      ? supplied
      : randomUUID();
  req.id = id;
  req.log = logger.child({ requestId: id });
  res.setHeader("x-request-id", id);
  next();
}
