import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { db } from "@/db";
import { cookies } from "next/headers";
import { TestCasesTable, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
});

const ALLOWED_EXTENSIONS = [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".md",
];

const IMPORTANT_FILES = [
    "package.json",
    "next.config",
    "middleware",
    "app/",
    "pages/",
    "components/",
    "src/",
    "lib/",
    "utils/",
    "actions/",
    "api/",
    "server/",
];

const IGNORE_PATHS = [
    "node_modules",
    ".next",
    "dist",
    "build",
    ".git",
    "coverage",
    "public/",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".webp",
    ".mp4",
    ".mov",
];

function isUsefulFile(path: string) {
    const isIgnored = IGNORE_PATHS.some((item) => path.includes(item));

    const isAllowedExtension = ALLOWED_EXTENSIONS.some((ext) =>
        path.endsWith(ext)
    );

    const isImportantPath = IMPORTANT_FILES.some((item) =>
        path.includes(item)
    );

    return !isIgnored && isAllowedExtension && isImportantPath;
}

async function getRepoTree({
    owner,
    repo,
    branch,
    githubToken,
}: {
    owner: string;
    repo: string;
    branch: string;
    githubToken: string;
}) {
    const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        {
            headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github+json",
            },
        }
    );

    if (!res.ok) {
        throw new Error("Failed to fetch GitHub repo tree");
    }

    const data = await res.json();

    return data.tree
        .filter((item: any) => item.type === "blob")
        .filter((item: any) => isUsefulFile(item.path))
        .slice(0, 25);
}

async function readGithubFile({
    owner,
    repo,
    path,
    branch,
    githubToken,
}: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    githubToken: string;
}) {
    const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
        {
            headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github+json",
            },
        }
    );

    if (!res.ok) {
        return null;
    }

    const data = await res.json();

    if (!data.content) {
        return null;
    }

    const decodedContent = Buffer.from(data.content, "base64").toString("utf-8");

    return {
        path,
        content: decodedContent.slice(0, 5000),
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const cookiesStore = await cookies();
        const githubToken = cookiesStore.get('gh_token')?.value;

        const {
            userId,
            repoId,
            owner,
            repo,
            branch = "main",
        } = body;

        if (!userId || !owner || !repo || !githubToken) {
            return NextResponse.json(
                {
                    error: "userId, owner, repo and githubToken are required",
                },
                { status: 400 }
            );
        }

        // Check user credits
        const [user] = await db.select().from(users).where(eq(users.id, Number(userId)));
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        if (user.credits < 200) {
            return NextResponse.json(
                { error: "Insufficient credits to generate test cases. Required: 200 credits." },
                { status: 402 } // Payment Required
            );
        }

        // 1. Get repo tree
        const repoFiles = await getRepoTree({
            owner,
            repo,
            branch,
            githubToken,
        });

        // 2. Read useful files
        const fileContents = await Promise.all(
            repoFiles.map((file: any) =>
                readGithubFile({
                    owner,
                    repo,
                    branch,
                    path: file.path,
                    githubToken,
                })
            )
        );

        const validFiles = fileContents.filter(Boolean);

        if (validFiles.length === 0) {
            return NextResponse.json(
                {
                    error: "No useful source files found in this repository",
                },
                { status: 400 }
            );
        }

        // 3. Prepare compact repo context
        const repoContext = validFiles
            .map(
                (file: any) => `
File Path: ${file.path}

File Content:
${file.content}
`
            )
            .join("\n\n----------------------\n\n");

        // 4. Ask Claude to generate test cases with metadata
        const prompt = `
You are an expert QA automation engineer.

Analyze the GitHub repository source code and generate useful small test cases.

Your goal:
Generate test cases that can later be converted into Playwright / Browserbase automation scripts.

Repository:
Owner: ${owner}
Repo: ${repo}
Branch: ${branch}

Repository File Context:
${repoContext}

Generate 5 to 8 test cases.

Each test case must include:
- title: clear test case title
- description: one-line description
- type: one of ui, auth, api, form, integration, edge-case
- priority: low, medium, high
- targetRoute: most likely app route/page to test, for example /sign-in, /dashboard, /api/users
- targetFiles: related file paths from the repository context
- expectedResult: what should happen when the test passes

Important rules:
- Only use file paths that exist in the repository context.
- Do not invent fake target files.
- If route is unclear, infer from Next.js app/page structure.
- Keep description short, only one line.
`;

        // Force a tool call so the response is schema-shaped JSON
        const response = await anthropic.messages.create({
            model: "claude-opus-5-5",
            max_tokens: 8192,
            messages: [{ role: "user", content: prompt }],
            tools: [
                {
                    name: "save_test_cases",
                    description: "Save the generated test cases",
                    input_schema: {
                        type: "object",
                        properties: {
                            testCases: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        title: { type: "string" },
                                        description: { type: "string" },
                                        type: {
                                            type: "string",
                                            enum: [
                                                "ui",
                                                "auth",
                                                "api",
                                                "form",
                                                "integration",
                                                "edge-case",
                                            ],
                                        },
                                        priority: {
                                            type: "string",
                                            enum: ["low", "medium", "high"],
                                        },
                                        targetRoute: { type: "string" },
                                        targetFiles: {
                                            type: "array",
                                            items: { type: "string" },
                                        },
                                        expectedResult: { type: "string" },
                                    },
                                    required: [
                                        "title",
                                        "description",
                                        "type",
                                        "priority",
                                        "targetRoute",
                                        "targetFiles",
                                        "expectedResult",
                                    ],
                                },
                            },
                        },
                        required: ["testCases"],
                    },
                },
            ],
            tool_choice: { type: "tool", name: "save_test_cases" },
        });

        const toolUse = response.content.find((block) => block.type === "tool_use");
        const aiResult: any = toolUse && toolUse.type === "tool_use" ? toolUse.input : {};
        const testCases = aiResult.testCases || [];

        if (!testCases.length) {
            return NextResponse.json(
                {
                    error: "Claude did not generate any test cases",
                },
                { status: 400 }
            );
        }

        // 5. Save generated test cases to Neon DB
        const insertedTestCases = await db
            .insert(TestCasesTable)
            .values(
                testCases.map((testCase: any) => ({
                    userId,
                    repoId,
                    repoName: repo,
                    repoOwner: owner,
                    branch,

                    title: testCase.title,
                    description: testCase.description,
                    type: testCase.type,
                    priority: testCase.priority,

                    targetRoute: testCase.targetRoute,
                    targetFiles: testCase.targetFiles || [],
                    expectedResult: testCase.expectedResult,

                    status: "generated",
                }))
            )
            .returning();

        // 6. Deduct 200 credits
        const newCredits = user.credits - 200;
        await db.update(users).set({ credits: newCredits }).where(eq(users.id, Number(userId)));

        return NextResponse.json({
            success: true,
            message: "Test cases generated successfully",
            count: insertedTestCases.length,
            testCases: insertedTestCases,
            credits: newCredits,
        });
    } catch (error: any) {
        console.error("Generate test cases error:", error);

        return NextResponse.json(
            {
                success: false,
                error: error.message || "Failed to generate test cases",
            },
            { status: 500 }
        );
    }
}
