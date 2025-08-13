import { NextRequest, NextResponse } from 'next/server';

// Configure for static export
export const dynamic = 'force-static';
export const revalidate = false;

// Simple health check endpoint with basic security
export async function GET(request: NextRequest) {
  // Check for suspicious patterns in headers
  const userAgent = request.headers.get('user-agent')?.toLowerCase() || '';
  const referer = request.headers.get('referer') || '';
  
  // Block if coming from suspicious sources
  const suspiciousPatterns = [
    'bot', 'crawler', 'spider', 'scraper', 'scanner',
    'hack', 'exploit', 'vulnerability', 'pentest'
  ];
  
  const isSuspicious = suspiciousPatterns.some(pattern => 
    userAgent.includes(pattern) || referer.includes(pattern)
  );
  
  if (isSuspicious) {
    return NextResponse.json(
      { error: 'Access denied' }, 
      { status: 403 }
    );
  }
  
  // Return minimal info
  return NextResponse.json(
    { 
      status: 'ok',
      timestamp: new Date().toISOString(),
      // No version info or system details for security
    },
    {
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    }
  );
}

// Block all other HTTP methods
export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
