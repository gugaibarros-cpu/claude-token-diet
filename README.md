# Economia de tokens no Claude Code

Diagnóstico de uso real (30 dias, 1.892 transcripts locais), o que foi mudado por causa dele e dois hooks que nasceram de
falhas observadas. Tudo em português. Nada aqui é conselho genérico: cada número saiu dos logs de uma máquina só, então
meça a sua antes de copiar a ordem de prioridade.

## O que o diagnóstico achou

O gasto vem de **contexto grande lido a cada chamada**, não de texto gerado: leitura de cache 72%, escrita de cache 20%,
saída 9%. Três drenos explicaram quase tudo:

1. **Sessões e subagentes que rodam até ~1M de contexto.** As sessões principais que passaram de 600k somaram 40% do
   gasto; os subagentes que passaram de 300k, mais 37%. Uma chamada numa sessão de 900k lê 9 vezes o que leria numa nova.
2. **Contexto fixo de ~100k tokens por sessão**, antes de qualquer trabalho (84k num subagente): 28% de todo o input lido.
3. **Subagentes são 57% do gasto**, quase todos implementadores com 300 a 750 chamadas cada.

Tarefas agendadas e revisores somaram menos de 1,5%: não valia mexer nelas. Método e tabela completa em
[docs/diagnostico.md](docs/diagnostico.md).

## O que foi feito (e o que ficou só proposto)

| Ação | Estado |
| :--- | :--- |
| Desligar plugins sem uso no mês (10 de 19) | **Feito** (19/11/2026), medido pelo `settings.json` |
| Filtro de saída de comandos (rtk) para cortar ruído de terminal | **Feito**; tem uma armadilha, ver abaixo |
| Hook que injeta as observações abertas ao carregar uma skill | **Feito** ([hooks/skill-obs-grep.mjs](hooks/skill-obs-grep.mjs)) |
| Hook que impede o agente de escrever em repositório de terceiros | **Feito** ([hooks/bloquear-postagem-terceiros.mjs](hooks/bloquear-postagem-terceiros.mjs)) |
| Teto de contexto: sessão nova por lote, subagente com teto e handback | Proposto, não medido |
| Task Observer mais barato (hook `SessionStart` em vez de carregar 50 KB) | Proposto; mexe numa regra do dono, aguarda decisão |
| Espera em background em vez de laço de `sleep`/`Monitor` | Proposto |

Quem quiser reproduzir deve medir antes e depois (CodeBurn `last_7_days` contra a linha de base do diagnóstico), porque
"proposto" aqui significa sem número de ganho.

## Hooks

- **`hooks/skill-obs-grep.mjs`** (`PreToolUse`, matcher `Skill`): ao carregar uma skill, injeta as observações abertas do
  [Task Observer](https://github.com/rebelytics/one-skill-to-rule-them-all) que citam essa skill. Antes, o `grep` por
  skill era uma lembrança do agente e falhava; agora viaja com a invocação. Pasta do log em `TASK_OBSERVER_LOG` (padrão
  `~/.claude/task-observer/skill-observations/observation-log`).
- **`hooks/bloquear-postagem-terceiros.mjs`** (`PreToolUse`, matcher `Bash|PowerShell`): bloqueia `gh issue|pr|discussion`
  de escrita, `gh api` com verbo de escrita e `curl` com escrita na API do GitHub fora dos donos que você liberar em
  `~/.claude/hooks/postagem-permitida.json`. Sem o arquivo, nada passa. `node bloquear-postagem-terceiros.mjs --teste`
  roda 28 casos.

Registro no `settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Skill", "hooks": [{ "type": "command", "command": "node \"~/.claude/hooks/skill-obs-grep.mjs\"" }] },
      { "matcher": "Bash|PowerShell", "hooks": [{ "type": "command", "command": "node \"~/.claude/hooks/bloquear-postagem-terceiros.mjs\"", "timeout": 10 }] }
    ]
  }
}
```

Troque `~` pelo caminho absoluto da sua pasta de usuário se o seu Claude Code não expandir.

## Regras para o `CLAUDE.md`

Texto pronto, sem nomes de projeto, em [snippets/claude-md.md](snippets/claude-md.md): orçamento de contexto, texto livre
fora da linha de comando, teste de ausência com controle positivo e releitura antes de enviar texto para fora.

## Armadilha do filtro de saída (rtk)

O filtro devolveu saída **vazia** em um `grep` que tinha resultado e **quebrou comandos que começam com atribuição de
variável** (`X=1 cmd` vira "binário `X=1` não encontrado"). Contorno: não prefixe o comando com `VAR=...`; exporte antes ou
use `env VAR=... cmd`. Se o resultado estiver vazio e você esperava saída, reexecute com `rtk bypass <cmd>`.

## Créditos e licença

MIT (veja [LICENSE](LICENSE)). O Task Observer é de Eoghan Henn e colaboradores (CC BY 4.0); este repositório não
redistribui a skill, só um hook que lê o log dela.
