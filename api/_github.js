const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'zanestack2324/j-jewellers';
const API_BASE = 'https://api.github.com';

function headers() {
  return {
    Authorization: 'token ' + GITHUB_TOKEN,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'j-jewellers-admin'
  };
}

async function getFile(path) {
  const res = await fetch(API_BASE + '/repos/' + GITHUB_REPO + '/contents/' + path, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub GET failed: ' + res.status);
  const data = await res.json();
  return { sha: data.sha, content: data.content ? Buffer.from(data.content, 'base64').toString('utf8') : null, size: data.size };
}

async function createOrUpdateFile(path, content, message, existingSha) {
  const body = { message: message, content: Buffer.from(content, 'utf8').toString('base64') };
  if (existingSha) body.sha = existingSha;
  const method = existingSha ? 'PUT' : 'PUT';
  const res = await fetch(API_BASE + '/repos/' + GITHUB_REPO + '/contents/' + path, {
    method: method,
    headers: headers(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('GitHub PUT failed: ' + res.status + ' ' + err);
  }
  return await res.json();
}

async function deleteFile(path, sha, message) {
  const res = await fetch(API_BASE + '/repos/' + GITHUB_REPO + '/contents/' + path, {
    method: 'DELETE',
    headers: headers(),
    body: JSON.stringify({ message: message, sha: sha })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('GitHub DELETE failed: ' + res.status + ' ' + err);
  }
  return await res.json();
}

async function createOrUpdateBinary(path, base64Data, message, existingSha) {
  const body = { message: message, content: base64Data };
  if (existingSha) body.sha = existingSha;
  const res = await fetch(API_BASE + '/repos/' + GITHUB_REPO + '/contents/' + path, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('GitHub binary PUT failed: ' + res.status + ' ' + err);
  }
  return await res.json();
}

function isConfigured() {
  return !!GITHUB_TOKEN;
}

module.exports = { getFile, createOrUpdateFile, deleteFile, createOrUpdateBinary, isConfigured };
