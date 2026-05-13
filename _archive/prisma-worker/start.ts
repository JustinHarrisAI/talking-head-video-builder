// Worker entry point - run with: npx tsx src/workers/start.ts
import "./process-video";
import "./post-video";

console.log("[workers] All workers started. Listening for jobs...");
console.log("[workers] Press Ctrl+C to stop.");

// Keep process alive
process.on("SIGINT", () => {
  console.log("[workers] Shutting down...");
  process.exit(0);
});
