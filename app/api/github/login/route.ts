import { NextRequest, NextResponse } from "next/server";

// Starts the GitHub OAuth flow; /api/github/callback stores the token in the gh_token cookie.
export async function GET(req: NextRequest) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) return NextResponse.json({ error: "GITHUB_CLIENT_ID not set" }, { status: 500 });

    const redirectUri = new URL('/api/github/callback', req.url).toString();
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'repo read:user');
    return NextResponse.redirect(url);
}
