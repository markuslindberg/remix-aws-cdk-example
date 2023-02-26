import { createCookie, redirect } from "@remix-run/node";
import { createDynamoDBSessionStorage } from "server/createDynamoDBSessionStorage";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set");
}

const sessionCookie = createCookie("__session", {
  secure: process.env.NODE_ENV === "production",
  secrets: [sessionSecret],
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
  httpOnly: true,
});

/**
 * The region, table and attribute names should match cdk.ts.
 */
const storage = createDynamoDBSessionStorage({
  cookie: sessionCookie,
  region: "us-east-1",
  tableName: "RemixAppSessions",
  idx: "_idx",
  ttl: "_ttl",
});

function getUserSession(request: Request) {
  return storage.getSession(request.headers.get("Cookie"));
}

export async function createUserSession(userId: string, redirectTo: string) {
  const session = await storage.getSession();
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await storage.commitSession(session),
    },
  });
}

export async function getUserId(request: Request) {
  const session = await getUserSession(request);
  const userId = session.get("userId");
  if (!userId || typeof userId !== "string") return null;
  return userId;
}

export async function logout(request: Request) {
  const session = await getUserSession(request);
  return redirect("/", {
    headers: {
      "Set-Cookie": await storage.destroySession(session),
    },
  });
}
