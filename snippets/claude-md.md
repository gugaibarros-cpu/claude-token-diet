# Trechos para o CLAUDE.md

Copie só o que se aplica ao seu caso. Cada trecho nasceu de uma falha real; o motivo vem logo abaixo dele.

## Orçamento de contexto

> Sessão que passar de ~300k fecha com handoff (estado em arquivo) e o trabalho segue em sessão nova. Subagente recebe
> uma fase pequena e devolve handback antes de ~150 chamadas. Espera longa usa `run_in_background` e notificação, nunca
> laço de `sleep`. Para conferir página, texto antes de screenshot.

Motivo: ver [diagnóstico](../docs/diagnostico.md). Ainda sem medição de ganho.

## Texto livre nunca vai na linha de comando

> Texto livre (Markdown, mensagem de commit, conteúdo de arquivo) chega ao disco pela ferramenta de edição, por arquivo,
> ou por heredoc com o delimitador entre aspas simples (`<<'EOF'`). Nunca entre aspas duplas num comando
> (`node -e "..."`, `git commit -m "..."`): o shell executa o que estiver entre crases ou em `$(...)`.

Motivo: uma linha de Markdown com caminhos entre crases rodou cada caminho como script.

## Teste de ausência precisa de controle positivo

> Todo teste de "quem não deve ver X" (privacidade, permissão, filtro) prova primeiro, no mesmo estado e na mesma
> chamada, que quem pode ver vê X. Sem esse controle, o teste passa tanto quando a proteção funciona quanto quando o
> dado nunca esteve lá.

Motivo: um teste de privacidade passava porque o dado já não existia no estado testado; o vazamento real só apareceu
numa revisão independente.

## Texto que sai da máquina é relido inteiro

> Todo texto que sai da máquina (issue, comentário, PR, e-mail, mensagem) é relido inteiro no arquivo antes do envio.
> Cada número ou contagem medido na sessão passa pela pergunta: "isto conta defeitos, ou conta outra coisa?".

Motivo: um comentário público citou uma contagem de "achados reais" que a própria sessão já tinha classificado como
falsos positivos esperados. Complementa o hook `bloquear-postagem-terceiros.mjs`.

## Planos conferidos contra o repositório

> Todo plano é conferido contra o repositório, não só contra ele mesmo: `Create:` de arquivo que já existe vira
> `Modify:` depois de ler o arquivo. Todo comportamento de sistema externo de que um requisito depende entra no plano
> como prova observada.

Motivo: planos de implementação mandavam criar arquivos que já existiam.
