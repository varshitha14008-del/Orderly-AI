/**
 * Seeded Marketplace Catalog and Default Policy Configuration
 */

import { BuyerPolicy, MerchantPolicy } from "../policy/types";

export interface MarketplaceProduct {
  id: string;
  title: string;
  description: string;
  category: string;
  listPrice: number;
  floorPrice: number;
  imageUrl?: string;
}

export const SEEDED_PRODUCTS: MarketplaceProduct[] = [
  {
    id: "prod-kb-01",
    title: "Ergonomic Mechanical Keyboard",
    description: "Hot-swappable custom mechanical switches with gasket mount and PBT doubleshot keycaps.",
    category: "Electronics",
    listPrice: 75.0,
    floorPrice: 45.0,
  },
  {
    id: "prod-hp-02",
    title: "Wireless ANC Studio Headphones",
    description: "Hybrid active noise cancellation, 40mm beryllium drivers, 35-hour battery life.",
    category: "Audio",
    listPrice: 120.0,
    floorPrice: 70.0,
  },
  {
    id: "prod-cam-03",
    title: "4K Pro Streaming Webcam",
    description: "Ultra-HD Sony sensor, dual stereo microphones, low-light HDR optimization.",
    category: "Video",
    listPrice: 95.0,
    floorPrice: 55.0,
  },
  {
    id: "prod-dock-04",
    title: "10-in-1 USB-C Aluminum Dock",
    description: "Dual 4K HDMI, 100W Power Delivery pass-through, Gigabit Ethernet, SD card reader.",
    category: "Accessories",
    listPrice: 65.0,
    floorPrice: 38.0,
  },
];

export const DEFAULT_BUYER_POLICY: BuyerPolicy = {
  max_price: 60.0,
  auto_accept_below: 40.0,
  ask_human_above: 50.0,
  no_subscriptions: true,
  forbidden_terms: ["crypto", "non-refundable"],
};

export const DEFAULT_MERCHANT_POLICY: MerchantPolicy = {
  list_price: 75.0,
  floor_price: 45.0,
  bundle_rules: [{ min_quantity: 2, max_discount_percent: 20 }],
  forbidden_claims: ["lifetime warranty", "unlimited free returns"],
  refund_rules: [
    { category: "not_as_described", policy: "full_refund", max_days: 30 },
    { category: "damaged", policy: "partial_refund", partial_refund_percent: 50, max_days: 14 },
    { category: "changed_mind", policy: "contest", max_days: 7 },
  ],
};
