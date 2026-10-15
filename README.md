# Tanu-Tyura

**Plataforma web de apoio à aprendizagem da língua Kambeba (Omágua).**

## Sobre o projeto

O Tanu-Tyura é um projeto acadêmico desenvolvido no curso de Sistemas de Informação. Seu objetivo é apoiar a aprendizagem da língua Kambeba por meio de uma plataforma web com conteúdos organizados por categorias, consulta de vocabulário e atividades educativas.

A proposta busca contribuir para a valorização e a aprendizagem da língua, respeitando as fontes linguísticas utilizadas e a validação dos conteúdos por colaboradores Kambeba.

## Funcionalidades

* Cadastro e autenticação de usuários.
* Módulos de aprendizagem organizados por categorias.
* Dicionário Kambeba–Português com pesquisa de palavras.
* Estrutura de atividades de múltipla escolha.
* Estrutura para armazenamento dos resultados das atividades.

## Módulos de aprendizagem

O conteúdo está organizado em cinco categorias:

1. Cumprimentos e apresentações.
2. Números.
3. Cores.
4. Família e pessoas.
5. Palavras do cotidiano.

O banco de dados contém 43 palavras cadastradas, com seus respectivos termos em Kambeba e traduções para o português. Os áudios ainda serão incorporados após a coleta e validação dos materiais com a professora Kambeba.

## Tecnologias utilizadas

* **Figma Make:** prototipação e desenvolvimento assistido da interface web.
* **Supabase:** serviços de autenticação e back-end.
* **PostgreSQL:** gerenciamento do banco de dados relacional.
* **SQL:** criação de tabelas, relacionamentos, consultas e políticas de acesso.
* **PlantUML:** elaboração dos diagramas UML.
* **GitHub:** versionamento e armazenamento do código-fonte.

## Banco de dados

O projeto possui tabelas para usuários, módulos, palavras, atividades, questões e resultados, além de uma tabela privada destinada ao armazenamento das respostas corretas das questões.

Foram configurados relacionamentos entre as entidades, políticas de segurança por linha (RLS) e uma rotina para criação automática do perfil do usuário após o cadastro.

Os cinco módulos e as 43 palavras iniciais foram cadastrados no banco. A integração do dicionário foi implementada, incluindo pesquisa pelo início do termo em Kambeba ou da tradução em português.

## Acessibilidade e usabilidade

O desenvolvimento considera as heurísticas de usabilidade de Nielsen, as diretrizes WCAG e o modelo e-MAG como referências para orientar a interface e sua avaliação.

A validação sistemática da acessibilidade e da usabilidade deverá ser documentada a partir dos testes realizados.

## Etapas em desenvolvimento

* Implementação das atividades, questões e correção das respostas.
* Integração e armazenamento dos resultados.
* Incorporação dos áudios aos módulos de aprendizagem.
* Implementação e testes do funcionamento offline.
* Avaliação de usabilidade e acessibilidade.
* Aprimoramento da responsividade da plataforma.

## Segurança

O projeto utiliza o Supabase Auth para autenticação e políticas RLS para controlar o acesso aos dados. Chaves secretas e credenciais não devem ser armazenadas no repositório nem expostas no código executado no navegador.

## Contexto acadêmico

Projeto desenvolvido como trabalho acadêmico do curso de Sistemas de Informação, com foco no apoio à aprendizagem da língua Kambeba (Omágua).
