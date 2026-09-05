// Self-hosted Edge Functions dispatcher.
//
// The hosted Supabase platform routes /functions/v1/<name> to <name>/index.ts
// for you. The self-hosted `supabase/edge-runtime` container does NOT — it runs
// ONE entrypoint (this file, the "main service") which spawns a user worker per
// request based on the first path segment. This is the standard boilerplate
// from Supabase's self-hosting guide.
//
// Not used by `supabase functions serve` (the CLI has its own dispatcher) and
// not deployed to hosted Supabase — it exists only for infrastructure/supabase/
// docker-compose.yml's edge-functions service.
//
// Verified end-to-end 2026-09-05 against a real self-hosted stack: routed
// set-jmap-secret and sync-contacts correctly through Kong -> this dispatcher
// -> EdgeRuntime.userWorkers -> the target function's own index.ts, including
// resolving `../_shared/jmap.ts` from within a spawned worker. Still worth
// re-checking this API surface when bumping the pinned edge-runtime image.

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  // /functions/v1/<name>/...  ->  segments = ["", "functions", "v1", "<name>", ...]
  // Kong strips /functions/v1, so inside the container it's /<name>/...
  const segments = url.pathname.split("/").filter(Boolean);
  const functionName = segments[0];

  if (!functionName) {
    return Response.json({ error: { code: "bad_request", message: "missing function name in path" } }, { status: 400 });
  }

  const servicePath = `/home/deno/functions/${functionName}`;
  const envVars = Object.entries(Deno.env.toObject());

  try {
    // @ts-expect-error EdgeRuntime is a global provided by the edge-runtime host
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 256,
      workerTimeoutMs: 120_000,
      noModuleCache: false,
      importMapPath: null,
      envVars,
    });
    return await worker.fetch(req);
  } catch (err) {
    console.error(`main dispatcher failed for "${functionName}":`, err);
    return Response.json(
      { error: { code: "worker_error", message: String(err) } },
      { status: 500 },
    );
  }
});
