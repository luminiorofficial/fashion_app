// Shared by the Gemini text and image providers, both of which back off
// exponentially between retry attempts against the same base delay.
export function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
