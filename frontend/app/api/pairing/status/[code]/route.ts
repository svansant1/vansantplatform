import { proxyPairingRequest } from "../../_backend";

type PairStatusRouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(
  _request: Request,
  context: PairStatusRouteContext,
) {
  const { code } = await context.params;
  return proxyPairingRequest(
    `/debugger/pair-status/${encodeURIComponent(code)}`,
  );
}
