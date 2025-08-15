import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware deaktiviert für statischen Export (Next.js output: 'export').
// Sicherheits-Header werden über firebase.json gesetzt.

function disabledMiddleware(request: NextRequest) {
  return NextResponse.next();
}

const disabledConfig = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
};
