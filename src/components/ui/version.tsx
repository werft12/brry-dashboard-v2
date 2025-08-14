import React from 'react';

const APP_VERSION = "V2.0.1";

export default function Version() {
  return (
    <div className="text-center py-4 mt-8">
      <span className="text-xs text-gray-500">
        {APP_VERSION}
      </span>
    </div>
  );
}

export { APP_VERSION };
