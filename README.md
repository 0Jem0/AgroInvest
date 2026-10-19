# Caso AgroInvest — Contabilidade IV

## Como funcionam grupos e reservas

- As reservas são compartilhadas pelo serviço Netlify: cada aluno pode pertencer a um grupo e cada empresa pode ser reservada por apenas um grupo.
- A equipe pode editar a composição pelo botão **Editar integrantes**. Os nomes removidos ficam disponíveis de novo; os nomes adicionados são verificados antes de salvar.
- A empresa é fixa depois da reserva e não pode ser trocada pelo grupo.
- O navegador guarda uma credencial aleatória do grupo para permitir a edição. Não limpem os dados do site nem troquem de navegador/aparelho durante a atividade. A recuperação entre aparelhos ainda não está implementada.
- As respostas e o progresso continuam salvos no `localStorage` do celular do grupo; as reservas, por outro lado, ficam no Netlify e são visíveis a todos.

O serviço usa Netlify Functions e Netlify Blobs com gravações condicionais para que duas equipes não reservem simultaneamente o mesmo aluno ou empresa. Como o site é público e não tem login, a reserva presume que cada equipe selecionará seus próprios integrantes.

## Publicar no Netlify

O projeto não é mais apenas HTML estático: arrastar somente os arquivos para **Deploy manually** não publica o endpoint de reservas. Publique o projeto completo para que o Netlify também compile e disponibilize a Function.

**Opção recomendada — conectar um repositório Git**

1. Coloque a pasta do projeto em um repositório Git privado da professora.
2. No `app.netlify.com`, escolha **Add new site** → **Import an existing project** e conecte o repositório.
3. Deixe o comando de build vazio e o diretório de publicação como `.`; o `netlify.toml` já configura também a pasta das Functions.
4. O Netlify instalará as dependências do `package-lock.json` e publicará a Function em `/api/reservations`.
5. Confirme que a Function responde antes de compartilhar o endereço HTTPS com os alunos.

## Testes

Com Node.js instalado, execute:

```powershell
npm install
npm test
```

Um servidor local estático não executa a função compartilhada de reservas. O bloqueio global só fica ativo após publicar o projeto completo no Netlify.

## Atualizar os dados

Com Python e `openpyxl` instalados, execute `python gerar_dados.py` nesta pasta antes de publicar atualizações. O arquivo Excel deve estar na pasta `Trabalho`, ao lado da pasta `AgroInvest`. O gerador lê Questões, Empresas, Gabarito E1–E5 e Parecer (blocos); revise avisos sobre abas ausentes, confira o `dados.json` e publique um novo deploy. Os registros de reservas são armazenados na loja site-wide do Netlify Blobs, separada dos arquivos publicados.

## Google Form

O envio automático de etapas ao Google Form depende de preencher a URL `formResponse` e os identificadores `entry.*` em `FORM_CONFIG`, no `index.html`. Até essa configuração ser feita, os envios permanecem na fila local do celular do grupo; quando offline, serão reenviados ao recuperar a conexão.
