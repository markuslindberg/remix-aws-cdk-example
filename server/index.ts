import { createRequestHandler } from "./createRequestHandler";

export type {
  GetLoadContextFunction,
  RequestHandler,
} from "./createRequestHandler";

export const handler = createRequestHandler({
  build: require("../build"),
  getLoadContext(_event) {
    // use lambda event to generate a context for loaders
    return {};
  },
  mode: process.env.NODE_ENV,
});
