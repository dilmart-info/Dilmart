/**
 * Types for DilMart Marketplace Store Integration & Catalog Segmentation.
 */

export type StoreSurface = "web_store" | "customer_app" | "all";

/** Viewer context used for product segmentation decisions */
export interface ViewerContext {
  surface: StoreSurface;
  segment?: string;
  businessType?: string;
  isTrusted?: boolean;
}

export type ResolvedAudience =
  | "customer"
  | "business"
  | "wholesale"
  | "all";

