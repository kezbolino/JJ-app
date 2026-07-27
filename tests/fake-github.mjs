// A tiny in-memory stand-in for the slice of the GitHub Git Data API that
// js/sync.js uses. Lets the sync tests run without a token or a network.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const sha = text => createHash('sha1').update(text).digest('hex');

export function startFakeGitHub({ port = 8098, owner = 'kezbolino', repo = 'jj-app-data' } = {}) {
  const blobs = new Map();   // sha -> base64 content
  const trees = new Map();   // sha -> [{path, sha}]
  const commits = new Map(); // sha -> {tree, parents}
  let head = null;           // commit sha, null = empty repo

  const state = {
    get files() {
      if (!head) return {};
      const out = {};
      for (const node of trees.get(commits.get(head).tree)) {
        out[node.path] = Buffer.from(blobs.get(node.sha), 'base64').toString('utf8');
      }
      return out;
    },
    get commitCount() {
      let n = 0;
      for (let c = head; c; c = commits.get(c).parents[0]) n++;
      return n;
    },
    get lastMessage() { return head ? commits.get(head).message : null; },
  };

  const server = createServer(async (req, res) => {
    const send = (code, body) => {
      res.writeHead(code, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };

    if (req.method === 'OPTIONS') return send(204);

    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(`/repos/${owner}/${repo}`, '');
    const body = req.method === 'GET' ? null : JSON.parse(await readBody(req) || '{}');

    // repo metadata
    if (path === '' && req.method === 'GET') {
      return send(200, { private: true, default_branch: 'main', permissions: { push: true } });
    }

    if (path === '/git/ref/heads/main' && req.method === 'GET') {
      if (!head) return send(404, { message: 'Not Found' });
      return send(200, { object: { sha: head } });
    }

    if (path.startsWith('/git/commits/') && req.method === 'GET') {
      const commit = commits.get(path.split('/').pop());
      if (!commit) return send(404, { message: 'No commit' });
      return send(200, { tree: { sha: commit.tree } });
    }

    if (path.startsWith('/git/trees/') && req.method === 'GET') {
      const nodes = trees.get(path.split('/').pop()) ?? [];
      return send(200, { tree: nodes.map(n => ({ ...n, type: 'blob', mode: '100644' })) });
    }

    if (path.startsWith('/git/blobs/') && req.method === 'GET') {
      const content = blobs.get(path.split('/').pop());
      if (content === undefined) return send(404, { message: 'No blob' });
      return send(200, { content, encoding: 'base64' });
    }

    if (path === '/git/blobs' && req.method === 'POST') {
      const id = sha(body.content);
      blobs.set(id, body.content);
      return send(201, { sha: id });
    }

    if (path === '/git/trees' && req.method === 'POST') {
      const base = body.base_tree ? [...(trees.get(body.base_tree) ?? [])] : [];
      const byPath = new Map(base.map(n => [n.path, n]));
      for (const node of body.tree) {
        if (node.sha === null) byPath.delete(node.path);
        else byPath.set(node.path, { path: node.path, sha: node.sha });
      }
      const nodes = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
      const id = sha(JSON.stringify(nodes));
      trees.set(id, nodes);
      return send(201, { sha: id });
    }

    if (path === '/git/commits' && req.method === 'POST') {
      const id = sha(JSON.stringify(body) + Math.random());
      commits.set(id, { tree: body.tree, parents: body.parents ?? [], message: body.message });
      return send(201, { sha: id });
    }

    if (path === '/git/refs' && req.method === 'POST') { head = body.sha; return send(201, { object: { sha: head } }); }
    if (path === '/git/refs/heads/main' && req.method === 'PATCH') { head = body.sha; return send(200, { object: { sha: head } }); }

    send(404, { message: `Unhandled ${req.method} ${path}` });
  });

  return new Promise(resolve => {
    server.listen(port, () => resolve({ server, state, url: `http://localhost:${port}` }));
  });
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}
