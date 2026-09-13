import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const pathParts = resolvedParams.path || [];

    if (pathParts.length === 0) {
      return new NextResponse('Not found', { status: 404 });
    }

    // Charts are saved to: my-agent/finance_charts/<filename>.png
    const myAgentDir = path.resolve(process.cwd(), '..', 'my-agent');
    const chartsDir = path.join(myAgentDir, 'finance_charts');

    // Prevent directory traversal — only allow single-level filenames
    const safeName = path.basename(pathParts[0]);
    const fullPath = path.join(chartsDir, safeName);

    if (!fs.existsSync(fullPath)) {
      return new NextResponse('Chart not found', { status: 404 });
    }

    const fileBuffer = await fs.promises.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();

    let contentType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.webp') contentType = 'image/webp';

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        // Short cache so fresh charts show up quickly
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('[finance-chart route] Error serving chart:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
