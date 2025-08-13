import React from "react";
import CustomerDetailsClient from "./client";

// Generate static params for static export
export async function generateStaticParams() {
  // For static export, we need to return actual customer IDs
  // Since we can't access the database at build time, we'll return a few common IDs
  // The client will handle cases where the customer doesn't exist
  return [
    { id: '1' },
    { id: '2' },
    { id: '3' },
    { id: '4' },
    { id: '5' }
  ];
}

// Disable dynamic params for static export
export const dynamicParams = false;

export default function CustomerDetailsPage() {
  return <CustomerDetailsClient />;
}
