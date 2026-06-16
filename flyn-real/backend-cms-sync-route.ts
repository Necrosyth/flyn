// backend/app/api/cms/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { syncToCMS } from '@/lib/services/cms-sync';

export async function POST(request: NextRequest) {
  try {
    const { projectId, pageId } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    const result = await syncToCMS({
      projectId,
      pageId,
      action: 'update',
    });

    return NextResponse.json({
      success: result,
      message: result ? 'CMS sync completed' : 'CMS sync failed',
    });
  } catch (error) {
    console.error('CMS sync error:', error);
    return NextResponse.json(
      { error: 'CMS sync failed' },
      { status: 500 }
    );
  }
}
