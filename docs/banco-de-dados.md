# Documentação do Banco de Dados — Tanu-Tyura

## 1. Visão geral

O banco de dados do Tanu-Tyura foi desenvolvido utilizando PostgreSQL, por meio da plataforma Supabase. Sua finalidade é armazenar e organizar as informações necessárias para a plataforma web de apoio à aprendizagem da língua Kambeba (Omágua).

A estrutura utiliza tabelas relacionais, chaves primárias, chaves estrangeiras, restrições de integridade e políticas de segurança para organizar os registros e controlar o acesso aos dados.

## 2. Tecnologias utilizadas

* **Supabase:** plataforma utilizada para gerenciamento do banco de dados e disponibilização de serviços de back-end.
* **PostgreSQL:** sistema gerenciador de banco de dados relacional utilizado para armazenar e relacionar os dados.
* **SQL:** linguagem utilizada para criação de tabelas, definição de relacionamentos, consultas e configuração de políticas de acesso.
* **Supabase Auth:** serviço responsável pela autenticação e pelo gerenciamento das credenciais dos usuários.
* **Supabase CLI:** ferramenta utilizada para vincular o projeto local ao banco remoto e gerar uma migração SQL contendo a estrutura existente.

## 3. Estrutura das tabelas

O banco de dados possui seis tabelas no esquema `public` e uma tabela no esquema privado `private`, destinada ao armazenamento das respostas corretas das questões.

### 3.1. usuarios

Armazena as informações complementares dos perfis dos usuários.

Principais campos:

* `id`: identificador UUID associado à conta do usuário no Supabase Auth e chave primária.
* `nome`: nome do usuário.
* `criado_em`: data e hora de criação do perfil.

A autenticação e o gerenciamento das senhas são responsabilidade do Supabase Auth. A tabela `usuarios` não armazena diretamente as senhas.

Foi configurada uma função associada a um gatilho para criar automaticamente o perfil quando uma nova conta é registrada. Esse comportamento foi verificado com um cadastro realizado pela interface da plataforma.

### 3.2. modulos

Armazena as categorias de aprendizagem da plataforma.

Principais campos:

* `id`: identificador do módulo.
* `nome`: nome do módulo.
* `descricao`: descrição do conteúdo.
* `ordem`: posição de exibição.
* `ativo`: indica se o módulo está disponível para exibição.
* `criado_em`: data e hora de criação.

Os cinco módulos cadastrados são:

1. Cumprimentos e apresentações.
2. Números.
3. Cores.
4. Família e pessoas.
5. Palavras do cotidiano.

O campo `nome` possui restrição de unicidade, evitando o cadastro de módulos com nomes duplicados.

### 3.3. palavras

Armazena o vocabulário utilizado nos módulos de aprendizagem e no dicionário Kambeba–Português.

Principais campos:

* `id`: identificador da palavra.
* `modulo_id`: chave estrangeira relacionada à tabela `modulos`.
* `termo_kambeba`: palavra ou expressão em Kambeba.
* `traducao_portugues`: significado em português.
* `audio_url`: referência opcional ao arquivo de áudio.
* `ativo`: indica se a palavra está disponível para exibição.
* `criado_em`: data e hora de criação.

O relacionamento entre `palavras` e `modulos` permite associar cada palavra à sua categoria correspondente. Uma restrição de unicidade impede a duplicação do mesmo termo dentro de um mesmo módulo.

A tabela contém 43 palavras cadastradas, distribuídas entre os cinco módulos. Os termos e significados foram organizados a partir do arquivo de vocabulário utilizado pela equipe, indicado como revisado por uma professora Kambeba.

O campo `audio_url` permanece vazio enquanto os áudios não forem coletados e validados. No dicionário, a interface apresenta apenas o termo e a tradução em português. Nos módulos de aprendizagem, o áudio será disponibilizado quando houver um arquivo válido.

### 3.4. atividades

Armazena as atividades gerais da plataforma, independentes dos módulos de aprendizagem.

Principais campos:

* `id`: identificador da atividade.
* `titulo`: título da atividade.
* `descricao`: descrição da atividade.
* `nivel`: nível de dificuldade.
* `ativo`: indica se a atividade está disponível para exibição.
* `criado_em`: data e hora de criação.

Os níveis aceitos pelo banco são `facil`, `medio` e `avancado`, correspondentes a Fácil, Médio e Avançado na interface.

As atividades são gerais e não possuem vínculo direto com os módulos de aprendizagem.

A tabela foi criada, mas a implementação completa das atividades na interface ainda está pendente.

### 3.5. questoes

Armazena as questões pertencentes às atividades.

Principais campos:

* `id`: identificador da questão.
* `atividade_id`: chave estrangeira relacionada à tabela `atividades`.
* `enunciado`: texto da questão.
* `alternativas`: alternativas armazenadas no formato JSONB.
* `ordem`: posição da questão dentro da atividade.
* `ativo`: indica se a questão está disponível para exibição.

As alternativas são identificadas pelas letras A, B, C e D. Uma restrição verifica a presença dessas identificações no objeto JSONB, enquanto outra impede a repetição da mesma ordem dentro de uma atividade.

Cada questão deve estar associada a uma atividade existente. A estrutura permite organizar várias questões em uma atividade, embora a existência de questões cadastradas para cada atividade ainda dependa da inclusão dos conteúdos.

As respostas corretas são armazenadas separadamente, na tabela `private.gabaritos`.

### 3.6. resultados

Armazena os resultados das tentativas realizadas pelos usuários nas atividades.

Principais campos:

* `id`: identificador do resultado.
* `usuario_id`: chave estrangeira relacionada à tabela `usuarios`.
* `atividade_id`: chave estrangeira relacionada à tabela `atividades`.
* `acertos`: quantidade de respostas corretas.
* `total_questoes`: quantidade total de questões consideradas na tentativa.
* `data_realizacao`: data e hora do registro.

A tabela possui restrições que impedem valores negativos de acertos, totais de questões menores ou iguais a zero e quantidades de acertos superiores ao total de questões.

A estrutura permite relacionar cada tentativa a um usuário e a uma atividade. Entretanto, o fluxo de gravação segura dos resultados pela interface ainda precisa ser implementado.

### 3.7. private.gabaritos

Armazena as respostas corretas das questões no esquema privado `private`.

Principais campos:

* `questao_id`: chave primária e chave estrangeira relacionada à tabela `questoes`.
* `resposta_correta`: alternativa correta, identificada por A, B, C ou D.

A separação das respostas corretas em um esquema privado busca impedir o acesso direto ao gabarito pelos papéis públicos da aplicação. Foram configuradas permissões para negar o acesso direto dessa tabela aos papéis `anon` e `authenticated`.

A implementação de um mecanismo seguro para validar as respostas e calcular os resultados deverá ser concluída no back-end antes da disponibilização das atividades.

## 4. Relacionamentos entre as tabelas

Os principais relacionamentos definidos são:

* Um módulo pode possuir várias palavras, e cada palavra está associada a um módulo.
* Cada questão está associada a uma atividade, que pode conter várias questões.
* Um usuário pode possuir vários resultados registrados.
* Uma atividade pode estar relacionada a vários resultados de tentativas diferentes.
* Cada perfil de usuário está associado à respectiva conta de autenticação do Supabase Auth.
* Cada registro de gabarito está relacionado a uma questão.

Esses relacionamentos utilizam chaves primárias e estrangeiras para estabelecer as associações entre registros e preservar a integridade referencial.

## 5. Autenticação e segurança

A autenticação é gerenciada pelo Supabase Auth, enquanto a tabela `usuarios` armazena informações complementares dos perfis.

Foi configurada uma função com um gatilho que cria automaticamente o perfil após o registro de uma nova conta. O funcionamento foi testado por meio de um cadastro realizado na interface da plataforma, seguido da verificação do perfil no banco de dados.

Também foi habilitada a segurança em nível de linha (*Row Level Security — RLS*) nas tabelas. Foram estabelecidas políticas iniciais para permitir a consulta dos conteúdos ativos e restringir o acesso aos perfis e resultados dos usuários conforme as permissões definidas.

Atualmente, as políticas de perfil permitem consultar e atualizar o próprio registro, além de inserir o perfil correspondente ao usuário autenticado. Para a tabela `resultados`, foi configurada a consulta dos próprios registros, enquanto a política de inserção ainda precisa ser implementada.

A tabela `private.gabaritos` permanece sem acesso direto concedido aos papéis públicos da aplicação. A validação das respostas deverá ser realizada por um mecanismo seguro no servidor.

As credenciais e chaves secretas devem permanecer fora do código-fonte publicado no GitHub e não devem ser expostas no front-end.

## 6. Versionamento do banco de dados

A estrutura do banco foi extraída do projeto remoto com o Supabase CLI, gerando uma migração SQL versionada no repositório.

O arquivo `supabase/migrations/20261017001524_remote_schema.sql` registra a estrutura do banco, incluindo tabelas, relacionamentos, funções, gatilhos e políticas de segurança identificados durante a extração.

O arquivo `supabase/seed.sql` contém os dados iniciais dos cinco módulos e das 43 palavras, permitindo reproduzir esses dados em outro ambiente após a criação das tabelas e das restrições correspondentes.

A migração e o arquivo de dados iniciais foram enviados ao GitHub. O `seed.sql` foi versionado, mas não foi executado novamente no banco remoto após essa etapa.

## 7. Estado atual do desenvolvimento

Até o momento, foram realizadas as seguintes etapas:

* Criação das tabelas relacionais.
* Configuração das chaves primárias, chaves estrangeiras, restrições e índices.
* Habilitação do RLS e configuração de políticas iniciais.
* Configuração e teste do gatilho de criação automática de perfil.
* Cadastro dos cinco módulos de aprendizagem.
* Cadastro das 43 palavras iniciais.
* Integração dos módulos e do dicionário à interface do projeto.
* Ajuste da pesquisa do dicionário para encontrar correspondências no início do termo em Kambeba ou da tradução em português.
* Geração da migração SQL e versionamento da estrutura e dos dados iniciais no GitHub.

Permanecem como etapas de desenvolvimento a implementação das atividades e questões, a validação segura das respostas, a gravação dos resultados, a incorporação dos áudios e o funcionamento offline com armazenamento local e sincronização.

## 8. Considerações finais

A estrutura do banco de dados do Tanu-Tyura foi organizada para separar os dados de perfil, os conteúdos linguísticos, as atividades, as questões e os resultados. O uso de um banco relacional permite representar as associações entre essas entidades e estabelecer restrições de integridade.

O versionamento da estrutura e dos dados iniciais no GitHub contribui para a documentação e a manutenção do projeto, permitindo registrar alterações futuras e preparar a reprodução do banco em outro ambiente. A documentação deverá ser atualizada conforme as funcionalidades forem implementadas, testadas e validadas.
