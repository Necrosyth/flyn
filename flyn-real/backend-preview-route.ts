// backend/app/api/preview/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const pageId = searchParams.get('pageId');

    if (!projectId || !pageId) {
      return NextResponse.json(
        { error: 'projectId and pageId required' },
        { status: 400 }
      );
    }

    const page = await prisma.builderPage.findUnique({
      where: { id: pageId },
      include: { components: true },
    });

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Return HTML preview
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${page.name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
          .preview { padding: 20px; }
        </style>
      </head>
      <body>
        <div class="preview">
          <h1>${page.name}</h1>
          ${page.components.map(c => `<div>${c.name}</div>`).join('')}
        </div>
        <script>
          window.addEventListener('message', (event) => {
            if (event.data.type === 'component-update') {
              console.log('Preview update received:', event.data);
              location.reload();
            }
          });
        </script>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: { 'content-type': 'text/html' },
    });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json({ error: 'Preview failed' }, { status: 500 });
  }
}
