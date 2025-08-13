import React from "react";
import CustomerDetailsClient from "./client";

// Generate static params for static export
export async function generateStaticParams() {
  // Return empty array for static export - pages will be generated on demand
  return [];
}

export default function CustomerDetailsPage() {
  return <CustomerDetailsClient />;
}
