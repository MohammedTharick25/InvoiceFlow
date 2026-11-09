import { PassThrough } from "node:stream";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import cron from "node-cron";
import multer from "multer";
import { stringify } from "csv-stringify/sync";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { z } from "zod";
import { createApp } from "../src/app.js";
import { safeParseEnv } from "../src/config/env.js";
import { createLogger } from "../src/utils/logger.js";
import {
  guardCsvCell,
  stringifyCsv,
  gstExportHeader,
} from "../src/utils/csv.js";
import { GST_DISCLAIMER } from "../src/utils/gstDisclaimer.js";

const validEnv = {
  NODE_ENV: "test",
  PORT: "4000",
  MONGODB_URI: "mongodb://localhost/test",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  FRONTEND_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "silent",
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
};

describe("backend foundation smoke", () => {
  it("validates environment at boot and serves health with a request ID", async () => {
    expect(safeParseEnv(validEnv).success).toBe(true);
    expect(
      safeParseEnv({ ...validEnv, JWT_ACCESS_SECRET: "short" }).success,
    ).toBe(false);
    const response = await request(
      createApp({
        env: { NODE_ENV: "test", FRONTEND_ORIGIN: validEnv.FRONTEND_ORIGIN },
      }),
    ).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("parses a Zod schema and bcrypt hashes and verifies a password", async () => {
    expect(
      z.object({ count: z.number().int() }).parse({ count: 2 }).count,
    ).toBe(2);
    const hash = await bcrypt.hash("Correct Horse Battery Staple 47!", 12);
    expect(await bcrypt.compare("Correct Horse Battery Staple 47!", hash)).toBe(
      true,
    );
    expect(await bcrypt.compare("wrong password", hash)).toBe(false);
  });

  it("redacts secrets from pino output", async () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk) => {
      output += chunk.toString();
    });
    const log = createLogger({ level: "info", stream });
    log.info(
      {
        password: "secret-pass",
        email: "person@example.test",
        requestId: "req-1",
      },
      "test record",
    );
    await new Promise((resolve) => log.flush(resolve));
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("secret-pass");
    expect(output).not.toContain("person@example.test");
    expect(output).toContain("req-1");
  });

  it("sends through Nodemailer JSON transport and schedules/stops node-cron", async () => {
    const mailer = nodemailer.createTransport({ jsonTransport: true });
    const message = await mailer.sendMail({
      from: "invoiceflow@example.test",
      to: "owner@example.test",
      subject: "Smoke",
      text: "ok",
    });
    expect(message.message).toContain("Smoke");
    const job = cron.schedule("0 0 * * *", () => {}, {
      scheduled: false,
      timezone: "UTC",
    });
    expect(job.getStatus()).toBe("idle");
    job.start();
    expect(job.getNextRun()).toBeInstanceOf(Date);
    job.stop();
    expect(job.getStatus()).toBe("stopped");
    job.destroy();
    expect(job.getStatus()).toBe("destroyed");
  });

  it("renders a PDF page with the bundled OFL font and rupee sign", async () => {
    const doc = new PDFDocument({ size: "A4", compress: false });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const ended = once(doc, "end");
    doc.registerFont(
      "NotoSansDevanagari",
      fileURLToPath(
        new URL(
          "../assets/fonts/NotoSansDevanagari-Regular.woff",
          import.meta.url,
        ),
      ),
    );
    doc
      .font("Helvetica")
      .fontSize(16)
      .text("Invoice total ", { continued: true });
    doc.font("NotoSansDevanagari").text("₹", { continued: true });
    doc.font("Helvetica").text("1,234.56");
    doc.end();
    await ended;
    const pdf = Buffer.concat(chunks);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("imports Multer and CSV stringifier", () => {
    expect(typeof multer).toBe("function");
    expect(stringify([{ name: "A" }], { header: true })).toContain("name");
  });

  it("guards CSV formula injection and includes the exact tax disclaimer on exports", () => {
    for (const formula of ["=1+1", "+1", "-1", "@SUM(A1)", "  =1+1"])
      expect(guardCsvCell(formula)).toBe(`'${formula}`);
    expect(stringifyCsv([{ name: "=1+1" }], ["name"])).toContain("'=1+1");
    expect(gstExportHeader()).toContain(GST_DISCLAIMER);
  });

  it("starts a replica set and commits and rolls back MongoDB transactions", async () => {
    const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const connection = await mongoose
      .createConnection(replica.getUri("invoiceflow_acceptance"))
      .asPromise();
    try {
      const collection = connection.db.collection("transaction_smoke");
      const committed = await connection.startSession();
      committed.startTransaction();
      await collection.insertOne({ key: "committed" }, { session: committed });
      await committed.commitTransaction();
      await committed.endSession();
      expect(await collection.countDocuments({ key: "committed" })).toBe(1);

      const rolledBack = await connection.startSession();
      rolledBack.startTransaction();
      await collection.insertOne(
        { key: "rolled-back" },
        { session: rolledBack },
      );
      await rolledBack.abortTransaction();
      await rolledBack.endSession();
      expect(await collection.countDocuments({ key: "rolled-back" })).toBe(0);
    } finally {
      await connection.close();
      await replica.stop();
    }
  }, 180_000);
});
