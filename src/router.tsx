import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload hover/intent results stay fresh for 30s — avoids refetching the
    // same Supabase rows when the user oscillates over the same link.
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
