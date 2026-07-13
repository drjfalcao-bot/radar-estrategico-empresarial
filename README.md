# Radar Estratégico Empresarial

Sistema de Apoio à Decisão e Leitura de Cenários de Risco Empresarial.

## Propósito

Plataforma visual para qualificação de leads, leitura explicável de risco, comparação de cenários e apoio à decisão em reuniões empresariais. O produto não é um CRM.

## Escopo da primeira entrega

- Tela 1 — Ficha Estratégica Empresarial
- formulário guiado por etapas
- leitura dinâmica de indicadores
- nível de confiança dos dados
- modo apresentação
- arquitetura preparada para autenticação Google, Supabase, segregação por usuário e geração de parecer em PDF

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase (fase de persistência e autenticação)

## Princípios

1. Indicadores explicáveis, sem falsa precisão.
2. Separação entre dado informado, inferência e regra oficial.
3. Cada consultor acessa somente seus próprios diagnósticos.
4. O administrador possui visão global.
5. Pareceres preservam versão, premissas e dados utilizados.

## Desenvolvimento

```bash
npm install
npm run dev
```
