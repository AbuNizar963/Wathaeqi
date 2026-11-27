import { describe, expect, it, vi } from "vitest";
import {
  requestPwaInstall,
  type BeforeInstallPromptEvent,
} from "./PwaInstallContext";

function createInstallPrompt(
  outcome: "accepted" | "dismissed"
): BeforeInstallPromptEvent {
  return {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  } as unknown as BeforeInstallPromptEvent;
}

describe("requestPwaInstall", () => {
  it("requests installation and returns the browser's accepted choice", async () => {
    const event = createInstallPrompt("accepted");

    await expect(requestPwaInstall(event)).resolves.toBe("accepted");
    expect(event.prompt).toHaveBeenCalledOnce();
  });

  it("preserves a dismissed choice without claiming installation", async () => {
    const event = createInstallPrompt("dismissed");

    await expect(requestPwaInstall(event)).resolves.toBe("dismissed");
    expect(event.prompt).toHaveBeenCalledOnce();
  });

  it("propagates browser prompt failures to the caller", async () => {
    const event = createInstallPrompt("accepted");
    vi.mocked(event.prompt).mockRejectedValueOnce(
      new Error("Install prompt unavailable")
    );

    await expect(requestPwaInstall(event)).rejects.toThrow(
      "Install prompt unavailable"
    );
  });
});
