import axios from "axios";
import { useAuthStore } from "../store/authStore.js";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api",
  withCredentials: true,
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  if (config.skipAuth) {
    delete config.headers.Authorization;
  } else if (!config.headers.Authorization) {
    const token = useAuthStore.getState().accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  delete config.skipAuth;
  return config;
});
