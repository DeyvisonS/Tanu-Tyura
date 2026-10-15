# Documentação do Banco de Dados — Tanu-Tyura

## 1. Visão geral

O banco de dados do Tanu-Tyura foi desenvolvido utilizando PostgreSQL, por meio da plataforma Supabase. Sua finalidade é armazenar e organizar os dados necessários para a plataforma web de apoio à aprendizagem da língua Kambeba (Omágua).

A estrutura utiliza tabelas relacionais, chaves primárias, chaves estrangeiras e políticas de segurança para organizar os registros e controlar o acesso aos dados.

## 2. Tecnologias utilizadas

* **Supabase:** plataforma de back-end e gerenciamento do banco de dados.
* **PostgreSQL:** sistema gerenciador de banco de dados relacional.
* **SQL:** linguagem utilizada para criação de tabelas, relacionamentos, consultas e políticas de acesso.
* **Supabase Auth:** serviço de autenticação dos usuários.

## 3. Estrutura das tabelas

### 3.1. usuarios

Armazena as informações complementares do perfil dos usuários.

Principais campos:

* `id`: identificador UUID associado ao usuário no Supabase Auth e chave primária.
* `nome`: nome do usuário.
* `criado_em`: data e hora de criação do perfil.

A autenticação e o gerenciamento de senhas são responsabilidade do Supabase Auth. As senhas não são armazenadas diretamente nessa tabela.

### 3.2. modulos

Armazena os módulos de aprendizagem da plataforma.

Principais campos:

* `id`: identificador do módulo.
* `nome`: nome do módulo.
* `descricao`: descrição do conteúdo.
* `ordem`: posição de exibição.
* `ativo`: indica se o módulo pode ser exibido.
* `criado_em`: data e hora de criação.

Os cinco módulos cadastrados são:

1. Cumprimentos e apresentações.
2. Números.
3. Cores.
4. Família e pessoas.
5. Palavras do cotidiano.

### 3.3. palavras

Armazena o vocabulário utilizado nos módulos de aprendizagem e no dicionário Kambeba–Português.

Principais campos:

* `id`: identificador da palavra.
* `modulo_id`: chave estrangeira relacionada à tabela `modulos`.
* `termo_kambeba`: palavra ou expressão em Kambeba.
* `traducao_portugues`: significado em português.
* `audio_url`: referência opcional ao arquivo de áudio.
* `ativo`: indica se a palavra pode ser exibida.
* `criado_em`: data e hora de criação.

O campo `audio_url` permanece vazio enquanto os áudios não forem coletados e validados. O dicionário apresenta o termo e a tradução, enquanto o áudio será utilizado nos conteúdos de aprendizagem quando estiver disponível.

A tabela contém 43 palavras cadastradas, distribuídas entre os cinco módulos.

### 3.4. atividades

Armazena as atividades gerais da plataforma, independentes dos módulos de aprendizagem.

Principais campos:

* `id`: identificador da atividade.
* `titulo`: título da atividade.
* `descricao`: descrição da atividade.
* `nivel`: nível de dificuldade.
* `ativo`: indica se a atividade pode ser exibida.
* `criado_em`: data e hora de criação.

Os níveis aceitos são `facil`, `medio` e `avancado`.

### 3.5. questoes

Armazena as questões pertencentes às atividades.

Principais campos:

* `id`: identificador da questão.
* `atividade_id`: chave estrangeira relacionada à tabela `atividades`.
* `enunciado`: texto da questão.
* `alternativas`: alternativas armazenadas em formato JSONB.
* `ordem`: posição da questão na atividade.
* `ativo`: indica se a questão pode ser exibida.

As alternativas são organizadas pelas identificações A, B, C e D. A estrutura do banco prevê restrições para evitar a duplicação da ordem das questões dentro de uma mesma atividade.

### 3.6. resultados

Armazena os resultados das tentativas dos usuários nas atividades.

Principais campos:

* `id`: identificador do resultado.
* `usuario_id`: chave estrangeira relacionada à tabela `usuarios`.
* `atividade_id`: chave estrangeira relacionada à tabela `atividades`.
* `acertos`: quantidade de respostas corretas.
* `total_questoes`: quantidade total de questões consideradas na tentativa.
* `data_realizacao`: data e hora do registro.

A estrutura contém restrições para impedir quantidades negativas de acertos, totais inválidos de questões e resultados em que os acertos sejam superiores ao total.

A gravação efetiva dos resultados pela interface ainda precisa ser implementada.

### 3.7. private.gabaritos

Armazena as respostas corretas das questões em uma tabela localizada no esquema privado `private`.

Principais campos:

* `questao_id`: chave primária e chave estrangeira relacionada à tabela `questoes`.
* `resposta_correta`: alternativa correta, identificada por A, B, C ou D.

A separação do gabarito em um esquema privado busca impedir a consulta direta das respostas corretas pelos papéis públicos da aplicação. A correção das respostas deverá ser implementada de maneira segura no servidor.

## 4. Relacionamentos

Os principais relacionamentos definidos são:

* Um módulo pode possuir várias palavras.
* Uma atividade contém uma ou mais questões.
* Um usuário pode possuir vários resultados.
* Uma atividade pode gerar vários resultados.

Os relacionamentos são implementados por chaves primárias e estrangeiras, assegurando a associação entre os registros.

## 5. Autenticação e segurança

A autenticação é gerenciada pelo Supabase Auth. A tabela `usuarios` mantém o perfil associado ao identificador da conta de autenticação.

Foi configurada uma função com um gatilho que cria automaticamente o perfil quando uma nova conta é registrada. Esse comportamento foi testado com o cadastro realizado pela interface da plataforma.

Também foi habilitada a segurança em nível de linha (Row Level Security — RLS) nas tabelas. Foram configuradas políticas para restringir o acesso aos perfis e resultados dos usuários e permitir a consulta dos conteúdos ativos conforme as permissões estabelecidas.

As chaves secretas e credenciais de acesso não devem ser armazenadas no repositório nem expostas no código executado no navegador.

## 6. Estado atual do banco

Até o momento, foram realizadas as seguintes etapas:

* Criação das tabelas relacionais.
* Configuração dos relacionamentos e índices.
* Habilitação do RLS e criação de políticas iniciais.
* Configuração e teste do gatilho de criação de perfil.
* Cadastro dos cinco módulos de aprendizagem.
* Cadastro das 43 palavras iniciais.
* Integração do dicionário e dos módulos à interface do projeto.

Permanecem como etapas de desenvolvimento a integração completa das atividades e questões, a gravação segura dos resultados, a incorporação dos áudios e a implementação do funcionamento offline.

## 7. Considerações finais

A estrutura do banco de dados foi organizada para atender às funcionalidades previstas no Tanu-Tyura, mantendo separados os dados de perfil, os conteúdos linguísticos, as atividades e os resultados. A documentação deverá ser atualizada conforme novas funcionalidades forem implementadas e testadas.
