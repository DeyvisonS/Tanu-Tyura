# Tanu-Tyura

**Plataforma web de apoio à aprendizagem da língua Kambeba (Omágua).**

## Sobre o projeto

O Tanu-Tyura é um projeto acadêmico desenvolvido no curso de Sistemas de Informação. Seu objetivo é apoiar a aprendizagem da língua Kambeba por meio de uma plataforma web com conteúdos organizados por categorias, consulta de vocabulário e atividades educativas.

A proposta busca contribuir para a valorização e a aprendizagem da língua, respeitando as fontes linguísticas utilizadas e a validação dos conteúdos por colaboradores Kambeba.

## Funcionalidades

- Cadastro e autenticação de usuários.
- Página inicial e navegação entre as áreas de aprendizagem.
- Cinco módulos organizados por categorias.
- Dicionário Kambeba–Português com pesquisa por prefixo.
- Atividades de múltipla escolha em três níveis: Fácil, Médio e Avançado.
- Exibição da pontuação retornada pelo servidor após a correção.
- Armazenamento local de conteúdos públicos e de tentativas realizadas offline.

## Conteúdo de aprendizagem

O conteúdo está organizado em cinco categorias:

1. Cumprimentos e apresentações.
2. Números.
3. Cores.
4. Família e pessoas.
5. Palavras do cotidiano.

A base atual contém **43 palavras**, conforme a lista validada pela professora Kambeba.

As atividades possuem três níveis de dificuldade, com **cinco questões por nível**, totalizando 15 questões. As alternativas são identificadas por A, B, C e D.

## Tecnologias utilizadas

- **Figma Make:** desenvolvimento assistido e manutenção da interface web.
- **React e TypeScript:** implementação da aplicação.
- **Vite:** ferramenta de desenvolvimento e build.
- **Supabase Auth:** autenticação de usuários.
- **Supabase / PostgreSQL:** banco de dados e serviços de back-end.
- **IndexedDB:** armazenamento local de conteúdos e tentativas offline.
- **Service Worker e Cache Storage:** cache do shell e dos recursos estáticos.
- **GitHub:** versionamento e armazenamento do código-fonte.

## Banco de dados e correção das atividades

O banco de dados possui seis tabelas no esquema `public`: `usuarios`, `modulos`, `palavras`, `atividades`, `questoes` e `resultados`. As respostas corretas ficam separadas na tabela privada `private.gabaritos`.

A interface consulta as atividades e questões cadastradas no Supabase. A correção é realizada exclusivamente pela função `public.corrigir_atividade()`, que consulta os gabaritos no esquema privado e registra o resultado associado ao usuário autenticado.

O identificador UUID da tentativa é reutilizado durante os reenvios para permitir idempotência e evitar registros duplicados. O gabarito não é enviado ao navegador nem armazenado no IndexedDB.

## Funcionamento offline

O funcionamento offline utiliza três mecanismos complementares:

- **Pré-carregamento global:** durante a inicialização online, a aplicação consulta os módulos, as palavras, as atividades e as questões e prepara automaticamente o conteúdo local. O estudante não precisa abrir individualmente cada seção para que os dados sejam armazenados.
- **IndexedDB:** o banco local `tanu-tyura-offline` (versão 2) mantém os stores `modules`, `words`, `activities`, `questions` e `attempts`. O conjunto público atual esperado é de cinco módulos, 43 palavras, três atividades e 15 questões.
- **Service Worker:** mantém o shell e os recursos permitidos em cache para permitir a reabertura da aplicação após a preparação inicial.

O pré-carregamento valida o conjunto recebido antes de atualizar os dados locais. Se as consultas falharem ou retornarem dados incompletos, o cache anterior é preservado. As tentativas pendentes também são preservadas durante as atualizações de conteúdo.

Quando uma atividade é finalizada sem conexão, as respostas são gravadas localmente com um UUID e permanecem pendentes. Ao retornar a conexão, a aplicação verifica a sessão e envia as respostas à função `public.corrigir_atividade()`. A pontuação definitiva só é apresentada após a confirmação do servidor.

O Service Worker não armazena requisições ao Supabase, credenciais, respostas autenticadas ou tentativas. O cache de recursos externos é restrito aos recursos de fontes autorizados no código.

### Limitações atuais do modo offline

- O primeiro carregamento e a preparação dos conteúdos exigem conexão com a internet.
- Login e cadastro continuam dependendo de conexão.
- A correção definitiva e a sincronização das tentativas exigem conexão.
- Áudios hospedados externamente ainda não estão garantidos para reprodução offline.
- A instalação como PWA e a autorização local para acesso offline ainda são etapas futuras de distribuição.

## Segurança

O Supabase Auth gerencia as credenciais dos usuários. As políticas RLS controlam o acesso aos dados. A função `public.corrigir_atividade()` executa a correção no servidor, consulta `private.gabaritos` e registra o resultado sem expor as respostas corretas ao front-end.

Não devem ser armazenadas no repositório chaves secretas, senhas ou credenciais privadas. A chave pública necessária ao cliente Supabase não substitui as políticas de segurança do banco.

## Acessibilidade e usabilidade

O desenvolvimento considera as heurísticas de usabilidade de Nielsen, as diretrizes WCAG e o modelo e-MAG como referências para orientar a interface e sua avaliação. A avaliação sistemática deve ser registrada a partir dos testes realizados.

## Validações realizadas e próximas etapas

Durante o desenvolvimento, foram relatadas as seguintes verificações:

- Compilação TypeScript (`pnpm exec tsc --noEmit`) e build (`pnpm build`) concluídos com sucesso no Figma Make.
- Correção das atividades testada no preview: Fácil 1/5, Médio 1/5 e Avançado 4/5, de acordo com os casos de teste utilizados.
- Pré-carregamento testado em Chromium com os dados reais: cinco módulos, 43 palavras, três atividades e 15 questões.
- Persistência dos conteúdos e das tentativas verificada em navegações separadas usando IndexedDB.
- Registro do Service Worker observado no preview do Figma Make.

A validação ponta a ponta da versão exportada e sincronizada com o GitHub deve continuar, especialmente a reabertura offline após uma atualização completa e a sincronização autenticada das tentativas.

## Contexto acadêmico

Projeto desenvolvido como trabalho acadêmico do curso de Sistemas de Informação, com foco no apoio à aprendizagem da língua Kambeba (Omágua).
