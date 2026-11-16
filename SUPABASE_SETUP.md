# Configuração do Supabase — Tanu-Tyura

Este documento descreve como a aplicação Tanu-Tyura se conecta ao Supabase e quais cuidados devem ser observados ao configurar um ambiente de desenvolvimento.

## 1. Serviço utilizado

O Tanu-Tyura utiliza o Supabase para:

- Autenticação de usuários por e-mail e senha.
- Armazenamento dos módulos, palavras, atividades e questões.
- Registro dos resultados das atividades.
- Execução da correção das atividades no servidor por meio da função `public.corrigir_atividade()`.

O banco de dados utiliza PostgreSQL. A estrutura, tabelas, relacionamentos e políticas de segurança estão descritos em [docs/banco-de-dados.md](docs/banco-de-dados.md).

## 2. Arquivos de integração

A conexão com o Supabase está organizada nos seguintes arquivos:

- `utils/supabase/info.tsx`: arquivo de configuração gerado pelo ambiente Figma Make, contendo o identificador do projeto e a chave pública do cliente.
- `src/lib/supabase.ts`: cria e exporta o cliente Supabase utilizado pela aplicação.
- `supabase/config.toml`: configurações locais do Supabase CLI.
- `supabase/migrations/`: arquivos SQL versionados para documentar e reproduzir a estrutura do banco.
- `supabase/seed.sql`: dados iniciais para criação de um ambiente separado.

O cliente Supabase utiliza a chave pública (anon/publishable), que pode estar presente no código do navegador. Essa chave não concede privilégios administrativos por si só; a segurança depende também das políticas RLS e das permissões configuradas no banco.

**Nunca coloque no front-end ou neste repositório a chave `service_role`, senhas de banco, tokens administrativos ou outros segredos.**

## 3. Configurar a autenticação

A aplicação utiliza os métodos de cadastro e login por e-mail e senha do Supabase Auth.

Para configurar um projeto Supabase destinado ao Tanu-Tyura:

1. Crie ou selecione o projeto no painel do Supabase.
2. Na área Authentication, confira se o provedor de e-mail está habilitado.
3. Confira as configurações de cadastro e confirmação de e-mail de acordo com o fluxo de autenticação que será utilizado.
4. Configure as URLs de redirecionamento para os endereços em que a aplicação será executada e publicada.

As opções do painel podem variar conforme o ambiente de publicação. Não compartilhe credenciais administrativas para realizar essa configuração.

## 4. Configuração da aplicação

No ambiente Figma Make, a integração do Supabase é gerenciada pela configuração do projeto e refletida em `utils/supabase/info.tsx`.

O arquivo `src/lib/supabase.ts` importa o identificador do projeto e a chave pública desse arquivo e inicializa o cliente com persistência de sessão, renovação automática de token e detecção de sessão na URL.

Ao executar uma cópia do projeto fora do Figma Make, confirme que `utils/supabase/info.tsx` contém o identificador e a chave pública do projeto Supabase correto. Não substitua essa configuração por uma chave administrativa.

## 5. Estrutura do banco e migrações

As migrações estão versionadas em ordem cronológica:

1. `supabase/migrations/20261017001524_remote_schema.sql`: registra a estrutura inicial do banco, incluindo tabelas, relacionamentos, funções e políticas.
2. `supabase/migrations/20261115010000_activity_correction_and_offline.sql`: registra a coluna UUID de tentativa, o índice único e a função segura `public.corrigir_atividade()`.

Em um **ambiente novo e separado**, as migrações devem ser aplicadas na ordem indicada, utilizando um fluxo controlado com Supabase CLI e conferindo o projeto conectado antes de qualquer operação.

### Atenção ao projeto remoto atualmente utilizado

No projeto remoto atual, as alterações da segunda migração já estão presentes no esquema do banco e foram verificadas no SQL Editor. Entretanto, na conferência realizada em 16 de novembro de 2026, a versão `20261115010000` ainda não aparecia no histórico `supabase_migrations.schema_migrations`.

Isso significa que o esquema já contém as alterações, mas o histórico de migrações ainda precisa ser regularizado. **Não execute `supabase db push`, não repita a migração SQL e não faça reset do banco remoto até concluir essa regularização.**

A regularização deve registrar a migração como aplicada sem executar novamente seu conteúdo. Consulte o histórico antes e depois do procedimento.

## 6. Dados iniciais (seed)

O arquivo `supabase/seed.sql` contém os dados de referência para um ambiente novo:

- Cinco módulos de aprendizagem.
- 43 palavras validadas.
- Três atividades, uma para cada nível.
- 15 questões, cinco por atividade.
- Respectivos gabaritos no esquema privado.

O arquivo está configurado em `supabase/config.toml` para uso no fluxo local de banco de dados.

**Não execute o seed no projeto remoto atual.** Os dados já estão cadastrados e o próprio arquivo informa que foi preparado para reproduzir os dados em outro ambiente.

## 7. Segurança da correção das atividades

As respostas corretas ficam na tabela privada `private.gabaritos`. O navegador envia apenas os identificadores das questões e as alternativas escolhidas.

A função `public.corrigir_atividade()`:

- Exige usuário autenticado.
- Valida a atividade, as cinco questões e o formato das respostas.
- Consulta o gabarito no esquema privado.
- Calcula os acertos no servidor.
- Registra o resultado associado ao usuário.
- Usa o UUID da tentativa para reconhecer reenvios e evitar duplicações.

O acesso à execução da função é concedido ao papel `authenticated`, não ao papel `anon`. O front-end não deve receber nem armazenar o gabarito.

## 8. Verificações realizadas

Em 16 de novembro de 2026, foram conferidos no banco remoto:

- Coluna `resultados.tentativa_uuid` com UUID obrigatório e valor padrão.
- Índice único `resultados_tentativa_uuid_uidx`.
- Existência da função `public.corrigir_atividade(uuid, bigint, jsonb)`.
- Propriedade `SECURITY DEFINER` da função.
- Permissão de execução para `authenticated`.
- Ausência de permissão de execução para `anon`.

A única pendência de controle identificada é o registro da migração `20261115010000` no histórico de migrações, conforme descrito na seção 5.

## 9. Documentação relacionada

- [Documentação do banco de dados](docs/banco-de-dados.md)
- [README do projeto](README.md)
