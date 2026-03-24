// ─────────────────────────────────────────────────────────
// Vercel Serverless Entry Point
// Re-exports the Express app for Vercel's @vercel/node runtime
// ─────────────────────────────────────────────────────────

// Import the full Express app (already configured with routes, CORS, etc.)
import app from '../src/server';

export default app;
