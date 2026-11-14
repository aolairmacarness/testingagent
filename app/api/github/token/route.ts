import { auth, clerkClient } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Token from the manual OAuth flow (/api/github/callback)
  const cookieToken = (await cookies()).get('gh_token')?.value;
  if (cookieToken) return NextResponse.json({ token: cookieToken });

  // Fall back to Clerk's GitHub connection
  const client = await clerkClient();
  const res = await client.users.getUserOauthAccessToken(userId, 'github');
  const token = res.data[0]?.token;
  if (!token) return NextResponse.json({ error: 'GitHub not connected' }, { status: 404 });

  return NextResponse.json({ token });
}
