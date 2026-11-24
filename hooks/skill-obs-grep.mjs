// PreToolUse na ferramenta Skill: injeta as observacoes ABERTAS que citam a skill sendo carregada.
// Barreira da obs 0014: o grep deixa de ser lembranca do agente e passa a viajar com a invocacao.
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG = process.env.TASK_OBSERVER_LOG ?? join(homedir(), ".claude", "task-observer", "skill-observations", "observation-log");
const CORPO_MAX = 1200; // por observacao; o corpo inteiro se le pelo caminho

let entrada = {};
try { entrada = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
const skill = String(entrada?.tool_input?.skill ?? "").trim();
if (!skill) process.exit(0);

const achadas = [];
try {
  for (const nome of readdirSync(LOG).filter((n) => n.endsWith(".md")).sort()) {
    const t = readFileSync(`${LOG}/${nome}`, "utf8").replace(/\r\n/g, "\n");
    const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) continue;
    const fm = m[1];
    const status = (fm.match(/^status:\s*(\S+)/m) ?? [])[1] ?? "open"; // sem status = open (regra do log)
    if (status !== "open") continue;
    // `skill: [a, "b:c"]` -> nomes inteiros, sem regex montada com o nome (que pode ter ':' e '-')
    const linha = (fm.match(/^skill:\s*(.*)$/m) ?? [])[1] ?? "";
    if (!(linha.match(/[A-Za-z0-9_.:-]+/g) ?? []).includes(skill)) continue;
    const titulo = ((fm.match(/^title:\s*(.*)$/m) ?? [])[1] ?? "").replace(/^"|"$/g, "");
    const corpo = m[2].trim();
    const resumo = corpo.slice(0, CORPO_MAX).replace(/\n/g, "\n  ");
    achadas.push(`- ${nome}: ${titulo}\n  ${resumo}${corpo.length > CORPO_MAX ? `\n  [...] corpo inteiro: ${LOG}/${nome}` : ""}`);
  }
} catch { process.exit(0); }
if (!achadas.length) process.exit(0);

const texto = `Observacoes ABERTAS que citam a skill "${skill}" (grep do task-observer, rodado pelo hook). ` +
  `Leia o corpo inteiro do que for relevante e aplique ao trabalho de AGORA (nao edite a skill: so o review faz isso):\n` + achadas.join("\n");
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: texto } }));
