# Diagnóstico de tokens (30 dias)

**Fonte.** 1.892 transcripts locais em `~/.claude/projects` + CodeBurn (leitura local; nada saiu da máquina). Cache hit de
99,99%, então o custo está em **quanto contexto cada chamada relê**, não em cache miss.

## Onde está o gasto

| Recorte | Peso no total |
| :--- | :--- |
| Sessões principais com contexto > 600k | 39,8% |
| Subagentes com contexto > 300k | 36,9% |
| Subagentes no total (1.597 de 1.892 transcripts) | 57% |
| As 4 sessões de orquestração mais caras | 13,2% (a maior: 6.845 chamadas, 16 compactações) |
| Sessões que carregaram uma skill de 50 KB (~13k tokens) em toda sessão | 30% (72 sessões) |
| Agendadas + revisores | < 1,5% |

Numa sessão de orquestração, cada `SendMessage` (311) e cada notificação de subagente (479) reentrava num contexto de
quase 1M.

## Recomendações, por impacto estimado

1. **Teto de contexto (~25 a 35%).** Orquestrador: uma sessão nova por lote da fila, com o estado em arquivo. Subagente:
   fase pequena e `handback` antes de ~150 chamadas ou ~300k. Testar `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (ex.: 30) para
   compactar perto de 300k; confirmar na documentação antes de ligar.
2. **Enxugar o contexto fixo (~10 a 12%).** Desligar plugins com zero uso no mês (feito: 10). Remover duplicata de
   conector. `CLAUDE.md` global de 19 KB para ~8 KB: o que vale só para um projeto vai para o `CLAUDE.md` dele.
3. **Skill sempre carregada mais barata (~3 a 5%).** Um hook `SessionStart` roda o scan e injeta só as linhas de achado;
   a skill inteira carrega só quando há algo a registrar. Muda uma regra do dono, então a decisão é dele.
4. **Esperar sem acordar o contexto (~2 a 4%).** 1.054 laços `sleep`/`until` e 1.365 `Monitor`, cada despertar lendo o
   contexto inteiro. Comando longo vai com `run_in_background` e espera a notificação.
5. **Navegador mais leve (~1 a 2%).** `browser_batch` devolveu até 1 MB. Preferir `get_page_text`/`read_page` e
   screenshot com `scale: 0.5` quando o objetivo é conferir texto.
6. **Modelo por tarefa (moderado).** Exploração e leitura de arquivos em Haiku. A estimativa de "routing waste" do
   CodeBurn é heurística; o ganho real depende da qualidade aceitável.

## Medir

CodeBurn `last_7_days` contra a linha de base: contexto inicial mediano 100k, 40% do gasto em sessões > 600k, 57% em
subagentes.

## Riscos

- Teto de escopo aumenta o número de handoffs. Handback ruim faz o subagente novo refazer a exploração e o "retry tax"
  sobe. O handback precisa listar arquivos tocados, estado dos testes e próximo passo.
- Desligar plugin tira skills do catálogo: confirme o que você usa de fato antes.
