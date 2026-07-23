const CHUNK_SIZE = 500;

export async function chunkedDelete(ids: string[], fn: (chunk: string[]) => Promise<unknown>) {
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    await fn(ids.slice(i, i + CHUNK_SIZE));
  }
}
