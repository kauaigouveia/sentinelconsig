import { useEffect, useState } from "react";
export type SearchTask = { id: string; title: string; clientName?: string };
export function useTaskSearch(scope: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    tasks: SearchTask[];
  }>({ scope: "", tasks: [] });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const controller = new AbortController();
    setSnapshot({ scope, tasks: [] });
    void fetch("/api/tasks", {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Tarefas indisponíveis");
        const data = await response.json();
        if (alive)
          setSnapshot({
            scope,
            tasks: Array.isArray(data)
              ? data
                  .filter(
                    (item) =>
                      typeof item?.id === "string" &&
                      typeof item?.title === "string",
                  )
                  .map((item) => ({
                    id: item.id,
                    title: item.title,
                    clientName:
                      typeof item.clientName === "string"
                        ? item.clientName
                        : undefined,
                  }))
              : [],
          });
      })
      .catch(() => {
        if (alive) setSnapshot({ scope, tasks: [] });
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [scope, enabled]);
  return enabled && snapshot.scope === scope ? snapshot.tasks : [];
}
