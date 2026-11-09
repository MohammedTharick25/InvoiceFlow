import { create } from "zustand";

export const useAuthStore = create((set) => ({
  initialized: false,
  bootstrapError: null,
  accessToken: null,
  expiresAt: null,
  user: null,
  workspace: null,

  setSession: (session, workspace = null) =>
    set((state) => ({
      initialized: true,
      bootstrapError: null,
      accessToken: session.accessToken,
      expiresAt: Date.now() + session.expiresIn * 1000,
      user: session.user ?? state.user,
      workspace,
    })),
  setWorkspace: (workspace) => set({ workspace }),
  setInitialized: () => set({ initialized: true, bootstrapError: null }),
  setBootstrapError: (bootstrapError) =>
    set({ initialized: true, bootstrapError }),
  clearSession: () =>
    set({
      initialized: true,
      bootstrapError: null,
      accessToken: null,
      expiresAt: null,
      user: null,
      workspace: null,
    }),
}));
