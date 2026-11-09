import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, extname, join, resolve } from "node:path";
import { StoredFile } from "./stored-file.model.js";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "node:stream";

export function createLocalStorageProvider({ root }) {
  if (!root) throw new TypeError("A local storage root is required.");
  const stagingPath = (id) => join(root, ".staging", `${id}.stage`);
  const finalPath = (id) => join(root, id.slice(0, 2), id);

  return Object.freeze({
    name: "local",
    async stage({ buffer }) {
      const id = randomUUID().replaceAll("-", "");
      const path = stagingPath(id);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer, { flag: "wx", mode: 0o600 });
      return { id, path };
    },
    async promote(staged) {
      const destination = finalPath(staged.id);
      await mkdir(dirname(destination), { recursive: true });
      try {
        await rename(staged.path, destination);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await stat(destination);
      }
      return { id: staged.id };
    },
    async read(id) {
      try {
        return await readFile(finalPath(id));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        return readFile(stagingPath(id));
      }
    },
    async remove(file) {
      if (file.path) await rm(file.path, { force: true });
      else {
        await rm(finalPath(file.id), { force: true });
        await rm(stagingPath(file.id), { force: true });
      }
    },
    async cleanupOrphans({
      keepIds = new Set(),
      olderThan = Date.now() - 24 * 60 * 60 * 1000,
    } = {}) {
      const directory = join(root, ".staging");
      const names = await readdir(directory).catch((error) =>
        error.code === "ENOENT" ? [] : Promise.reject(error),
      );
      for (const name of names) {
        if (!name.endsWith(".stage")) continue;
        const id = name.slice(0, -6);
        const path = stagingPath(id);
        if (keepIds.has(id)) {
          await this.promote({ id, path });
          continue;
        }
        const info = await stat(path).catch(() => null);
        if (info && info.mtimeMs < olderThan) await rm(path, { force: true });
      }
    },
  });
}

export function createCloudinaryStorageProvider({
  cloudName,
  apiKey,
  apiSecret,
  environment = "development",
}) {
  if (!cloudName || !apiKey || !apiSecret)
    throw new TypeError("Complete Cloudinary credentials are required.");
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  const upload = (buffer, publicId) =>
    new Promise((resolveUpload, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          type: "authenticated",
          public_id: publicId,
          overwrite: false,
        },
        (error, result) => (error ? reject(error) : resolveUpload(result)),
      );
      Readable.from([buffer]).pipe(stream);
    });
  const destroy = (publicId) =>
    new Promise((resolveDestroy, reject) => {
      cloudinary.uploader.destroy(
        publicId,
        { resource_type: "raw", type: "authenticated", invalidate: true },
        (error, result) => {
          if (error) reject(error);
          else if (result?.result === "not found") resolveDestroy();
          else resolveDestroy(result);
        },
      );
    });

  return Object.freeze({
    name: "cloudinary",
    async stage({ buffer, businessId, purpose = "invoice_pdf", filename }) {
      const extension = extname(filename ?? "")
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, "");
      const folder = `invoiceflow/${environment}/${businessId}/${purpose}`;
      const id = `${folder}/${randomUUID()}${extension}`;
      const tempId = `${folder}/.staging/${randomUUID()}${extension}`;
      await upload(buffer, tempId);
      return { id, tempId };
    },
    async promote(staged) {
      await new Promise((resolveRename, reject) => {
        cloudinary.uploader.rename(
          staged.tempId,
          staged.id,
          (error, result) => (error ? reject(error) : resolveRename(result)),
          {
            resource_type: "raw",
            type: "authenticated",
            overwrite: false,
          },
        );
      });
      return { id: staged.id };
    },
    async read(id) {
      const url = cloudinary.utils.private_download_url(id, null, {
        resource_type: "raw",
        type: "authenticated",
        attachment: true,
      });
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Private PDF download failed (${response.status}).`);
      return Buffer.from(await response.arrayBuffer());
    },
    async remove(staged) {
      await Promise.all([destroy(staged.tempId), destroy(staged.id)]);
    },
  });
}

export function createInvoiceStorageProvider({ env, root }) {
  if (env?.INVOICE_STORAGE_PROVIDER === "cloudinary") {
    return createCloudinaryStorageProvider({
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
      environment: env.NODE_ENV,
    });
  }
  return createLocalStorageProvider({ root });
}

export function createExpenseReceiptStorageProvider({ env, root }) {
  if (env?.INVOICE_STORAGE_PROVIDER === "cloudinary") {
    return createCloudinaryStorageProvider({
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
      environment: env.NODE_ENV,
    });
  }
  return createLocalStorageProvider({ root });
}

export async function cleanupInvoiceStorage({
  root = resolve(process.cwd(), "uploads", "invoices"),
} = {}) {
  const provider = createLocalStorageProvider({ root });
  const files = await StoredFile.find({
    provider: "local",
    purpose: "invoice_pdf",
  })
    .select("publicId")
    .lean();
  await provider.cleanupOrphans({
    keepIds: new Set(files.map((file) => file.publicId)),
  });
}

export async function cleanupExpenseReceiptStorage({
  root = resolve(process.cwd(), "uploads", "receipts"),
} = {}) {
  const provider = createLocalStorageProvider({ root });
  const files = await StoredFile.find({ provider: "local", purpose: "receipt" })
    .select("publicId")
    .lean();
  await provider.cleanupOrphans({
    keepIds: new Set(files.map((file) => file.publicId)),
  });
}
