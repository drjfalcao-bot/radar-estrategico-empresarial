# Radar Estratégico Empresarial

Sistema de apoio à decisão, análise acompanhada e pré-venda consultiva para cenários fiscais, financeiros, processuais e de Reforma Tributária.

**Release estável:** `2026.07.16-premium.8`

## Objetivo

O Radar organiza o caminho entre a identificação da empresa e a assinatura do contrato:

`Perfil empresarial → Análise acompanhada → Riscos → Simulações → Caderno (estratégia, relatório e proposta) → Funil`

O produto não substitui o CRM pós-venda. Após a assinatura, o caso pode ser encaminhado ao fluxo operacional externo.

## Módulos concluídos

- acesso por solicitação e aprovação;
- perfis `admin` e `user`;
- segregação de leads por responsável com RLS no Supabase;
- visão global e reatribuição de leads para administrador;
- Central de Diagnóstico e Simulação;
- perfil estratégico empresarial;
- análise acompanhada para reuniões;
- risco de exposição à Reforma Tributária, risco de caixa, risco fiscal e risco de cobrança;
- necessidade estratégica, potencial da oportunidade e probabilidade de fechamento para uso interno;
- ranking de oportunidades;
- funil de pré-venda com arraste;
- caderno automático e anotações manuais;
- agenda de prospecção e lembretes;
- estratégia e frentes de trabalho editáveis;
- plano de atuação derivado das frentes escolhidas;
- construtor de relatório por blocos;
- construtor de proposta editável no Caderno, com serviço, descrição, custo e métodos de pagamento;
- boleto e cartão sugeridos por padrão, com desconto, parcelamento e condições totalmente editáveis;
- estruturação de garantia disponível exclusivamente nas opções da proposta;
- precificação com referência, percentual e valor final editável;
- assinatura profissional vinculada ao perfil do usuário;
- relatório sem honorários por padrão;
- proposta financeira separada do relatório;
- PDF próprio da calculadora com identificação da empresa, passivo e simulações aplicáveis;
- comparação visual entre cenário atual, barreira e condição buscada.

## Simulador final de regularização

### Receita Federal

- parcelamento ordinário;
- primeiro reparcelamento com entrada de 10%;
- segundo ou posterior com entrada de 20%;
- entrada personalizada;
- prazo total editável;
- parcela mínima editável;
- cálculo do valor da entrada, saldo e prestação.

### PGFN

Modalidades disponíveis:

- transação parametrizada;
- TIS — Transação Individual Simplificada;
- transação de pequeno valor;
- cenário manual.

Parâmetros por caso:

- percentual da entrada;
- quantidade de parcelas da entrada;
- redução estimada;
- prazo total;
- prazo previdenciário;
- parcela mínima;
- referência financeira de pequeno valor;
- status de elegibilidade;
- observação da modalidade.

O fluxo é exibido em fases:

1. entrada parcelada;
2. saldo negociado.

As naturezas são separadas para evitar a mistura de prazo previdenciário com Simples Nacional e demais débitos.

## Segurança e persistência

Projeto Supabase: `radar-estrategico-empresarial`

Regras principais:

- usuário pendente não acessa a aplicação;
- usuário aprovado acessa somente as próprias leads;
- administrador acessa todas as leads;
- somente administrador aprova, rejeita, suspende e reatribui usuários/leads;
- cada lead possui `owner_user_id`;
- as políticas de acesso são aplicadas no banco por Row Level Security.

## Qualidade dos dados

Cada caso possui indicador de completude baseado nos campos essenciais para:

- análise;
- ratings;
- simulações;
- relatório;
- proposta;
- próxima ação comercial.

A interface também aplica máscara a CNPJ e telefone.

## Testes de regressão

O deploy executa testes automáticos para:

- Receita ordinária;
- primeiro reparcelamento de 10%;
- segundo reparcelamento de 20%;
- PGFN com entrada de 6% parcelada em 12 meses;
- separação de natureza previdenciária;
- TIS;
- pequeno valor;
- sintaxe dos módulos;
- presença dos módulos de autenticação, relatório, proposta, agenda e comparativo.

Arquivo de teste:

`tests/calculator-core.test.cjs`

## Casos fictícios disponíveis

Os casos com prefixo `[TESTE]` foram criados no Supabase para validação funcional. Incluem:

1. Receita ordinária;
2. primeiro reparcelamento de 10%;
3. segundo reparcelamento de 20%;
4. PGFN ME/EPP com entrada em 12x;
5. PGFN geral com entrada em 6x;
6. impedimento;
7. execução, bloqueio e penhora;
8. migração Receita → PGFN;
9. TIS;
10. pequeno valor.

## Premissas e responsabilidade de uso

As simulações são gerenciais e preliminares. Percentuais, prazos, reduções, elegibilidade, CAPAG, modalidades e condições devem ser confirmados conforme a norma, o edital e a situação efetivamente aplicáveis ao caso.

O sistema diferencia:

- dado informado;
- premissa ajustada;
- inferência do motor;
- condição sujeita à validação.

## Deploy

A aplicação é publicada por GitHub Pages.

URL:

`https://drjfalcao-bot.github.io/radar-estrategico-empresarial/`

O workflow de deploy valida a aplicação antes da publicação. A release não é enviada ao Pages quando os testes de regressão falham.
