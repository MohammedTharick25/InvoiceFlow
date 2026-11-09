import mongoose from "mongoose";

const jobLeaseSchema = new mongoose.Schema(
  {
    _id: { type: String },
    ownerId: { type: String, required: true },
    epoch: { type: Number, min: 1, required: true },
    leaseUntil: { type: Date, required: true },
    heartbeatAt: { type: Date, required: true },
    lastSuccessAt: { type: Date, default: null },
  },
  { versionKey: false },
);

export const JobLease = mongoose.model("JobLease", jobLeaseSchema);
