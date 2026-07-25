import { proxyPairingRequest } from "../_backend";

export async function POST(request: Request) {
  return proxyPairingRequest("/debugger/connect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: await request.text(),
  });
}
