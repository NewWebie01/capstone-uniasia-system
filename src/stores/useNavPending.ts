import { create } from "zustand";

type NavState = {
  isNavigating: boolean;
  setNavigating: (v: boolean) => void;
};

export const useNavPending = create<NavState>((set) => ({
  isNavigating: false,
  setNavigating: (v) => set({ isNavigating: v }),
}));
