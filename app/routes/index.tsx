import type { LoaderArgs, ActionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { getUserId, createUserSession } from "../utils/session.server";

export const loader = async ({ request }: LoaderArgs) => {
  const userId = await getUserId(request);
  return json({ userId });
};

export const action = async ({ request }: ActionArgs) => {
  return createUserSession("hello", "/");
};

export default function Index() {
  const data = useLoaderData<typeof loader>();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.4" }}>
      <h1>Welcome to Remix</h1>
      {data.userId ? (
        <div>
          <span>{`Hi ${data.userId}`}</span>
          <Form action="/logout" method="post">
            <button type="submit">Logout</button>
          </Form>
        </div>
      ) : (
        <Form method="post">
          <button type="submit">Login</button>
        </Form>
      )}
    </div>
  );
}
