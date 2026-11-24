// PreToolUse (Bash/PowerShell): o agente nunca escreve (comentario, issue, PR, review, release, mutation, API) em repositorio
// de TERCEIROS. Leitura (GET, view, clone, download) passa. O texto vai para um arquivo e a pessoa publica.
// Libere seus proprios donos em ~/.claude/hooks/postagem-permitida.json: { "donos": ["seu-usuario", "sua-org"] }.
// Sem o arquivo, NENHUMA escrita no GitHub passa. Autoteste: node bloquear-postagem-terceiros.mjs --teste
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const PADRAO = [];
function donosPermitidos() {
  try {
    const f = join(homedir(), ".claude", "hooks", "postagem-permitida.json");
    if (existsSync(f)) { const j = JSON.parse(readFileSync(f, "utf8")); if (Array.isArray(j.donos)) return j.donos.map((d) => String(d).toLowerCase()); }
  } catch { /* usa o padrao */ }
  return PADRAO;
}

// Tira corpos de heredoc (texto, nao comando) e quebra em segmentos fora de aspas.
function segmentos(cmd) {
  const linhas = cmd.split(/\r?\n/), fora = []; let fim = null;
  for (const l of linhas) {
    if (fim !== null) { if (l.trim() === fim) fim = null; continue; }
    fora.push(l);
    const m = l.match(/<<-?\s*['"]?(\w+)['"]?/);
    if (m) fim = m[1];
  }
  const s = fora.join("\n"), out = []; let atual = "", q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { atual += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; atual += c; continue; }
    if (c === "\n" || c === ";" || c === "|" || c === "&" || c === "(" || c === ")") { out.push(atual); atual = ""; continue; }
    atual += c;
  }
  out.push(atual);
  return out.map((x) => x.trim()).filter(Boolean);
}
const tokens = (seg) => [...seg.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);

const ESCRITA = {
  issue: /^(create|comment|edit|close|reopen|delete|lock|unlock|pin|unpin|transfer|develop)$/,
  pr: /^(create|comment|review|edit|close|reopen|merge|ready|update-branch|lock|unlock)$/,
  release: /^(create|edit|delete|upload)$/,
  label: /^(create|edit|delete|clone)$/,
};
const dono = (rs) => String(rs).replace(/^https?:\/\/github\.com\//i, "").replace(/^\/+/, "").split("/")[0].toLowerCase();

function repoDoCwd(cwd) {
  try {
    const u = execFileSync("git", ["-C", cwd || ".", "remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 4000 }).trim();
    const m = u.match(/github\.com[:/]+([^/]+)\/([^/.\s]+)/i);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch { return null; }
}

// Alvo de um `gh <grupo> <acao> ...`: -R/--repo, URL do github ou repo do cwd. Devolve "dono/repo" ou null (desconhecido).
function alvoGh(t, cwd) {
  for (let i = 0; i < t.length; i++) {
    if (/^(-R|--repo)$/.test(t[i]) && t[i + 1]) return t[i + 1];
    const m = t[i].match(/^--repo=(.+)$/); if (m) return m[1];
    const u = t[i].match(/^https?:\/\/github\.com\/([^/\s]+\/[^/\s#?]+)/i); if (u) return u[1];
  }
  return repoDoCwd(cwd);
}

function veredito(cmd, cwd, donos) {
  const ruins = [];
  for (const seg of segmentos(cmd)) {
    let t = tokens(seg);
    while (t.length && /^\w+=/.test(t[0])) t.shift();
    if (t[0] === "&") t.shift();
    while (t.length && /^(rtk|rtk\.exe|proxy|command|exec|sudo|nohup|time)$/i.test(t[0])) t.shift(); // prefixos que nao mudam o programa
    if (!t.length) continue;
    const prog = t[0].replace(/^.*[\\/]/, "").replace(/\.exe$/i, "").toLowerCase();
    if (prog === "gh") {
      const grupo = t[1], acao = t[2];
      if (grupo === "discussion" || (ESCRITA[grupo] && ESCRITA[grupo].test(acao || ""))) {
        const alvo = alvoGh(t, cwd);
        if (!alvo || !donos.includes(dono(alvo))) ruins.push(`gh ${grupo} ${acao || ""} em ${alvo || "repositorio desconhecido (use -R dono/repo)"}`);
      } else if (grupo === "api") {
        const metodo = (() => { for (let i = 2; i < t.length; i++) { if (/^(-X|--method)$/.test(t[i]) && t[i + 1]) return t[i + 1].toUpperCase(); const m = t[i].match(/^--method=(.+)$/); if (m) return m[1].toUpperCase(); } return null; })();
        const campos = t.some((x) => /^(-f|-F|--field|--raw-field|--input)$/.test(x) || /^--(field|raw-field|input)=/.test(x));
        const escreve = metodo ? metodo !== "GET" : campos;
        const caminho = t.slice(2).find((x, i, a) => !x.startsWith("-") && !/^(-X|--method|-H|--header|-f|-F|-q|--jq|-t|--template|--input|--hostname)$/.test(a[i - 1] || ""));
        const consulta = /graphql/i.test(caminho || "");
        if (consulta) { if (t.some((x) => /mutation/i.test(x))) ruins.push("gh api graphql com mutation"); }
        else if (escreve) {
          const m = String(caminho || "").replace(/^\/+/, "").match(/^repos\/([^/]+)\/([^/]+)/i);
          if (m) { if (!donos.includes(m[1].toLowerCase())) ruins.push(`gh api ${metodo || "POST"} em ${m[1]}/${m[2]}`); }
          else if (!/^(user|users\/[^/]+\/(?:following|starred))(\/|$)/i.test(String(caminho || "").replace(/^\/+/, "")) && !/^orgs\/([^/]+)\//i.test(String(caminho || "")) ) ruins.push(`gh api ${metodo || "POST"} ${caminho || ""} (destino nao identificado)`);
          else { const o = String(caminho).replace(/^\/+/, "").match(/^orgs\/([^/]+)\//i); if (o && !donos.includes(o[1].toLowerCase())) ruins.push(`gh api ${metodo || "POST"} em org ${o[1]}`); }
        }
      }
    }
    // curl / PowerShell direto na API do GitHub com verbo de escrita
    if (/^(curl|invoke-restmethod|invoke-webrequest|irm|iwr)$/.test(prog)) {
      const txt = seg;
      const g = txt.match(/api\.github\.com\/repos\/([^/\s'"]+)\/([^/\s'"?]+)/i);
      const escreve = /(-X\s*(POST|PUT|PATCH|DELETE)|--request\s+(POST|PUT|PATCH|DELETE)|\s-d\s|--data|-Method\s+(Post|Put|Patch|Delete)|-Body\s)/i.test(txt);
      if (g && escreve && !donos.includes(g[1].toLowerCase())) ruins.push(`${prog} com escrita em ${g[1]}/${g[2]}`);
    }
  }
  return ruins;
}

if (process.argv[2] === "--teste") {
  const D = ["meu-usuario"]; let falhas = 0;
  const caso = (cmd, bloqueia, cwd = "C:/nao-existe") => {
    const r = veredito(cmd, cwd, D).length > 0;
    if (r !== bloqueia) { falhas++; console.log(`FALHOU (esperava ${bloqueia ? "bloquear" : "permitir"}): ${cmd}`); }
  };
  caso("gh issue comment 2553 -R terceiro/repo --body-file x.md", true);
  caso("gh issue comment 2553 --repo=terceiro/repo --body-file x.md", true);
  caso("gh issue create -R terceiro/outro-repo --title t --body-file b.md", true);
  caso("gh pr review 3 -R someone/repo --approve", true);
  caso("gh issue comment 1 https://github.com/terceiro/repo/issues/1 --body x", true);
  caso("cd x && gh issue comment 9 -R terceiro/repo -b ok", true);
  caso("gh api -X PATCH repos/terceiro/repo/issues/comments/1 -F body=@f", true);
  caso("gh api repos/terceiro/repo/issues/1/comments -f body=oi", true);
  caso("gh api -X DELETE repos/terceiro/repo/issues/comments/1", true);
  caso("gh api graphql -f query='mutation { addComment(input:{}) { clientMutationId } }'", true);
  caso("curl -X POST https://api.github.com/repos/terceiro/repo/issues/1/comments -d '{}'", true);
  caso("gh issue comment 1 -R terceiro/repo --body x", true);
  caso("gh issue create --title t", true, "C:/nao-existe"); // sem repo identificavel: bloqueia
  caso("rtk gh issue comment 1 -R terceiro/repo --body x", true);
  caso("rtk proxy gh pr create -R someone/repo --title t", true);
  caso("gh issue comment 1 -R meu-usuario/meu-repo --body x", false);
  caso("gh pr create --repo meu-usuario/meu-repo --title t --body-file b", false);
  caso("gh pr merge 5 --repo meu-usuario/meu-repo --merge", false);
  caso("gh issue view 2553 -R terceiro/repo", false);
  caso("gh api repos/terceiro/repo/issues/2553/comments --jq .[].id", false);
  caso("gh api -X GET search/issues -f q=commenter:x", false);
  caso("gh api -X PUT user/starred/terceiro/repo", false);
  caso("gh release download v1.1.0 --repo terceiro/ferramenta", false);
  caso("gh repo clone terceiro/repo", false);
  caso("echo 'gh issue comment 1 -R terceiro/repo' > nota.txt", false);
  caso("cat > r.md <<'EOF'\ngh issue comment 1 -R terceiro/repo\nEOF", false);
  caso("curl -s https://api.github.com/repos/terceiro/repo/issues/1", false);
  console.log(falhas ? `${falhas} falha(s)` : "autoteste ok");
  process.exit(falhas ? 1 : 0);
}

let entrada = {};
try { entrada = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
const cmd = entrada?.tool_input?.command;
if (typeof cmd !== "string") process.exit(0);
const ruins = veredito(cmd, entrada.cwd, donosPermitidos());
if (ruins.length) {
  console.error(`Bloqueado: o agente nao publica em repositorios de terceiros (${ruins.join("; ")}). Salve o texto em um arquivo e peça a quem manda no projeto para publicar. Donos liberados: ${donosPermitidos().join(", ")}.`);
  process.exit(2);
}
