import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { ApiError, badRequest } from "../../utils/ApiError.js";
import { dateAtUtcMidnight } from "../../utils/clock.js";
import { TaxRate } from "./tax-rate.model.js";
import { TaxRateHead } from "./tax-rate-head.model.js";

const hashRate = ({ code, kind, rateBp, effectiveFrom }) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        code,
        kind,
        rateBp,
        effectiveFrom: effectiveFrom ?? null,
      }),
    )
    .digest("hex");

export function createTaxRateService({ now = () => new Date() } = {}) {
  async function appendVersion({ businessId, actorId, input }) {
    const effectiveFrom = input.effectiveFrom
      ? dateAtUtcMidnight(input.effectiveFrom)
      : null;
    if (input.kind === "end" && input.rateBp != null)
      throw badRequest(
        "VALIDATION_FAILED",
        "An end version cannot include a tax rate.",
      );
    if (
      input.kind === "rate" &&
      (!Number.isInteger(input.rateBp) ||
        input.rateBp < 1 ||
        input.rateBp > 10000)
    )
      throw badRequest(
        "VALIDATION_FAILED",
        "Tax rate must be 1 to 10000 basis points.",
      );

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const session = await mongoose.startSession();
      try {
        let inserted;
        await session.withTransaction(async () => {
          const head = await TaxRateHead.findOne({
            businessId,
            code: input.code,
          }).session(session);
          if (!head) {
            if (effectiveFrom !== null)
              throw new ApiError(
                409,
                "TAX_RATE_VERSION_OUT_OF_ORDER",
                "The first version for a tax code must have no effective-from date.",
              );
            const [createdHead] = await TaxRateHead.create(
              [
                {
                  businessId,
                  code: input.code,
                  latestEffectiveFrom: null,
                  latestVersionId: null,
                  versionCount: 0,
                  seq: 0,
                },
              ],
              { session },
            );
            const [version] = await TaxRate.create(
              [
                {
                  businessId,
                  code: input.code,
                  name: input.name,
                  kind: input.kind,
                  rateBp: input.rateBp ?? null,
                  effectiveFrom: null,
                  previousVersionId: null,
                  contentHash: hashRate({ ...input, effectiveFrom: null }),
                  createdBy: actorId,
                },
              ],
              { session },
            );
            createdHead.latestVersionId = version._id;
            createdHead.versionCount = 1;
            createdHead.seq = 1;
            await createdHead.save({ session });
            inserted = version;
            return;
          }

          if (
            !effectiveFrom ||
            (head.latestEffectiveFrom &&
              effectiveFrom <= head.latestEffectiveFrom)
          )
            throw new ApiError(
              409,
              "TAX_RATE_VERSION_OUT_OF_ORDER",
              "A new version must be later than the latest version.",
            );
          const before = await TaxRateHead.findOneAndUpdate(
            {
              _id: head._id,
              seq: head.seq,
              latestEffectiveFrom: head.latestEffectiveFrom ?? null,
            },
            {
              $set: { latestEffectiveFrom: effectiveFrom },
              $inc: { versionCount: 1, seq: 1 },
            },
            { returnDocument: "before", session },
          );
          if (!before)
            throw new ApiError(
              409,
              "TAX_RATE_VERSION_OUT_OF_ORDER",
              "A newer version was saved concurrently. Reload and try again.",
            );
          const [version] = await TaxRate.create(
            [
              {
                businessId,
                code: input.code,
                name: input.name,
                kind: input.kind,
                rateBp: input.rateBp ?? null,
                effectiveFrom,
                previousVersionId: before.latestVersionId,
                contentHash: hashRate({ ...input, effectiveFrom }),
                createdBy: actorId,
              },
            ],
            { session },
          );
          await TaxRateHead.updateOne(
            { _id: before._id, seq: before.seq + 1 },
            { $set: { latestVersionId: version._id } },
            { session },
          );
          inserted = version;
        });
        return serializeRate(inserted);
      } catch (error) {
        if (error?.code === 11000 && attempt < 3) continue;
        throw error;
      } finally {
        await session.endSession();
      }
    }
    throw new ApiError(
      409,
      "TAX_RATE_VERSION_OUT_OF_ORDER",
      "A newer version was saved concurrently. Reload and try again.",
    );
  }

  async function list({ businessId, code }) {
    const filter = { businessId };
    if (code) filter.code = code;
    const versions = await TaxRate.find(filter)
      .sort({ code: 1, effectiveFrom: 1, createdAt: 1 })
      .lean();
    return { taxRates: versions.map(serializeRate) };
  }

  async function resolve({ businessId, code, at, session }) {
    const date = dateAtUtcMidnight(at);
    const versions = await TaxRate.find({
      businessId,
      code,
      $or: [{ effectiveFrom: null }, { effectiveFrom: { $lte: date } }],
    })
      .sort({ effectiveFrom: -1 })
      .session(session ?? null)
      .lean();
    const version = versions[0];
    if (!version || version.kind === "end")
      throw badRequest(
        "TAX_RATE_NOT_CONFIGURED",
        `No tax rate is configured for ${code} on ${at}.`,
      );
    return version;
  }

  void now;
  return { appendVersion, list, resolve };
}

export function serializeRate(rate) {
  if (!rate) return null;
  return {
    id: rate._id.toString(),
    code: rate.code,
    name: rate.name,
    kind: rate.kind,
    rateBp: rate.rateBp,
    effectiveFrom: rate.effectiveFrom
      ? new Date(rate.effectiveFrom).toISOString().slice(0, 10)
      : null,
    previousVersionId: rate.previousVersionId?.toString() ?? null,
    contentHash: rate.contentHash,
    createdAt: rate.createdAt,
  };
}
