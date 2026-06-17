type RequestContext = {
  startedAt: number;
};

const contexts = new WeakMap<Request, RequestContext>();

export function beginRequest(request: Request) {
  contexts.set(request, {
    startedAt: performance.now(),
  });
}

export function getRequestContext(request: Request) {
  return contexts.get(request);
}

export function getRequestDurationMs(request: Request) {
  const context = getRequestContext(request);
  if (!context) return undefined;
  return Math.round((performance.now() - context.startedAt) * 100) / 100;
}

export function getRequestPath(request: Request) {
  return new URL(request.url).pathname;
}
