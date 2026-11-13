/// <reference types="vite/client" />
import type { MergeApi } from "../../shared/api";

declare global {
  interface Window {
    /** Exposed by the preload script. */
    merge: MergeApi;
  }
}

export {};
