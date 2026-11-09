import mongoose from "mongoose";

const jobRunSchema = new mongoose.Schema(
  {
    jobName: { type: String, required: true, index: true },
    ownerId: { type: String, required: true },
    epoch: { type: Number, min: 1, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
    },
    processed: { type: Number, default: 0 },
    errorCode: { type: String, default: "" },
  },
  { timestamps: true },
);

jobRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

export const JobRun = mongoose.model("JobRun", jobRunSchema);
