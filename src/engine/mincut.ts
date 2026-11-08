type Residual = { to: number; rev: number; cap: number };

/**
 * Undirected minimum cut. Each undirected edge has the given capacity.
 * Returns the indexes of original edges that cross the source side of the cut.
 */
export function undirectedMinCut(
  nodeCount: number,
  edges: { u: number; v: number; cap: number }[],
  source: number,
  sink: number,
): { flow: number; cut: number[] } {
  if (source === sink) return { flow: 0, cut: [] };
  const graph: Residual[][] = Array.from({ length: nodeCount }, () => []);

  const addDirected = (u: number, v: number, cap: number) => {
    const forward: Residual = { to: v, rev: graph[v].length, cap };
    const backward: Residual = { to: u, rev: graph[u].length, cap: 0 };
    graph[u].push(forward);
    graph[v].push(backward);
  };

  for (const edge of edges) {
    if (edge.u === edge.v || edge.cap <= 0) continue;
    addDirected(edge.u, edge.v, edge.cap);
    addDirected(edge.v, edge.u, edge.cap);
  }

  const level = new Array<number>(nodeCount).fill(-1);
  const queue: number[] = [];

  const bfs = (): boolean => {
    level.fill(-1);
    queue.length = 0;
    level[source] = 0;
    queue.push(source);
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head];
      for (const edge of graph[node]) {
        if (edge.cap > 1e-9 && level[edge.to] < 0) {
          level[edge.to] = level[node] + 1;
          queue.push(edge.to);
        }
      }
    }
    return level[sink] >= 0;
  };

  const pointer = new Array<number>(nodeCount).fill(0);
  const dfs = (node: number, pushed: number): number => {
    if (node === sink || pushed <= 0) return pushed;
    for (let i = pointer[node]; i < graph[node].length; i++) {
      pointer[node] = i;
      const edge = graph[node][i];
      if (edge.cap > 1e-9 && level[edge.to] === level[node] + 1) {
        const delivered = dfs(edge.to, Math.min(pushed, edge.cap));
        if (delivered > 0) {
          edge.cap -= delivered;
          graph[edge.to][edge.rev].cap += delivered;
          return delivered;
        }
      }
    }
    return 0;
  };

  let flow = 0;
  while (bfs()) {
    pointer.fill(0);
    let delivered = 0;
    do {
      delivered = dfs(source, 1e12);
      flow += delivered;
    } while (delivered > 0);
  }

  const reach = new Array<boolean>(nodeCount).fill(false);
  const seen: number[] = [source];
  reach[source] = true;
  for (let head = 0; head < seen.length; head++) {
    const node = seen[head];
    for (const edge of graph[node]) {
      if (edge.cap > 1e-9 && !reach[edge.to]) {
        reach[edge.to] = true;
        seen.push(edge.to);
      }
    }
  }

  const cut: number[] = [];
  edges.forEach((edge, index) => {
    if (edge.cap >= 1e8) return;
    if (reach[edge.u] !== reach[edge.v]) cut.push(index);
  });
  return { flow, cut };
}
