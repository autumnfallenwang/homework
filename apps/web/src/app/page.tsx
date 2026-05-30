import { apiBaseUrl } from "@/lib/api";

// Render at request time, not build time — this page reads live API state.
export const dynamic = "force-dynamic";

async function getApiHealth(): Promise<string> {
  try {
    const res = await fetch(`${apiBaseUrl()}/health`, { cache: "no-store" });
    if (!res.ok) return `error (HTTP ${res.status})`;
    const body = (await res.json()) as { status?: string };
    return body.status ?? "unknown";
  } catch {
    return "unreachable";
  }
}

export default async function Home() {
  const health = await getApiHealth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="font-bold text-2xl">Homework</h1>
      <p className="text-neutral-500">TeacherEase parent companion (web)</p>
      <p className="font-mono">
        API health: <strong>{health}</strong>
      </p>
    </main>
  );
}
