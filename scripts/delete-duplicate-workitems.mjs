import fs from "node:fs";
import path from "node:path";

const ORG = "vadvocaat";
const PROJECT = "Draconis-labs";
const DUPLICATE_EPIC_ROOTS = [71, 111, 152, 153, 154, 155, 172, 173, 174, 175, 179, 180];

function loadToken() {
  const envPath = path.join(process.env.USERPROFILE || process.env.HOME, ".cursor", "ado-mcp.env");
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^ADO_MCP_AUTH_TOKEN=(.+)$/m);
  if (!match) throw new Error("ADO_MCP_AUTH_TOKEN not found");
  return match[1].trim();
}

const token = loadToken();
const auth = Buffer.from(`:${token}`).toString("base64");
const base = `https://dev.azure.com/${ORG}/${PROJECT}/_apis`;

async function wiql(query) {
  const res = await fetch(`${base}/wit/wiql?api-version=7.1`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`WIQL failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.workItems ?? []).map((w) => w.id);
}

async function collectDescendants(rootIds) {
  const all = new Set(rootIds);
  const depth = new Map(rootIds.map((id) => [id, 0]));
  const queue = [...rootIds];
  while (queue.length > 0) {
    const parentId = queue.shift();
    const parentDepth = depth.get(parentId) ?? 0;
    const children = await wiql(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${PROJECT}' AND [System.Parent] = ${parentId}`,
    );
    for (const id of children) {
      if (!all.has(id)) {
        all.add(id);
        depth.set(id, parentDepth + 1);
        queue.push(id);
      }
    }
  }
  return [...all].sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
}

async function destroyIds(ids) {
  const concurrency = 10;
  let destroyed = 0;
  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = ids.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (id) => {
        const res = await fetch(
          `${base}/wit/workitems/${id}?destroy=true&api-version=7.1-preview.3`,
          {
            method: "DELETE",
            headers: { Authorization: `Basic ${auth}` },
          },
        );
        if (!res.ok) throw new Error(`Destroy ${id} failed: ${res.status} ${await res.text()}`);
        destroyed += 1;
      }),
    );
    console.log(`Destroyed ${destroyed}/${ids.length}`);
  }
}

const ids = await collectDescendants(DUPLICATE_EPIC_ROOTS);
console.log(`Collected ${ids.length} duplicate work items to delete`);
await destroyIds(ids);
console.log("Done");
