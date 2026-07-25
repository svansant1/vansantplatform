import { proxyPairingRequest } from "../_backend";

export async function POST() {
  return proxyPairingRequest("/debugger/create-pair-code", {
    method: "POST",
  });
}
