export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  return new Response(JSON.stringify({ status: 'OK EDGE', message: 'If this works, Node is the issue.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
