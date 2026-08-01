import "./App.css";

/**
 * Phase 0 placeholder shell.
 *
 * Deliberately feature-free — Phase 1 replaces this with the real application
 * shell (commit graph, staging panel, diff viewer). What it does do is exercise
 * both vendored font families and the design-system CSS variables, so that
 * running `pnpm tauri dev` with networking disabled is a meaningful check that
 * font bundling and the Content-Security-Policy work together.
 */
export default function App() {
  return (
    <main className="phase0-shell">
      <h1 className="phase0-title">PenguinGit</h1>
      <p className="phase0-tagline">A premium, open-source Git GUI built exclusively for Linux.</p>
      <p className="phase0-status mono">phase 0 — scaffolding &amp; ci</p>
    </main>
  );
}
