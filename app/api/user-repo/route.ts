import { db } from "@/db";
import { repositories } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const userId = Number(req.nextUrl.searchParams.get('userId'));
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const result = await db.select().from(repositories).where(eq(repositories.userId, userId));
    // Collapse duplicate rows for the same GitHub repo (keep the first one)
    const unique = result.filter((r, i, arr) => arr.findIndex(x => x.repoId === r.repoId) === i);
    return NextResponse.json(unique);
}

export async function POST(req: NextRequest) {
    const b = await req.json();
    if (!b.userId || !b.repoId) return NextResponse.json({ error: "userId and repoId required" }, { status: 400 });

    const existing = await db.select().from(repositories)
        .where(and(eq(repositories.userId, b.userId), eq(repositories.repoId, b.repoId)));
    if (existing.length) return NextResponse.json(existing[0]);

    const result = await db.insert(repositories).values({
        userId: b.userId,
        repoId: b.repoId,
        name: b.name,
        fullName: b.full_name,
        private: b.private_ ? 1 : 0,
        htmlUrl: b.html_url,
        description: b.description,
        owner: b.owner,
        language: b.language,
        defaultBranch: b.default_branch,
    }).returning();

    return NextResponse.json(result[0]);
}
