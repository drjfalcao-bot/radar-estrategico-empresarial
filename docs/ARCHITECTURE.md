# Arquitetura funcional

## Fluxo do produto

```text
Login Google
  → Painel de Diagnósticos
  → Ficha Estratégica Empresarial
  → Leitura Estratégica Inicial
  → Central de Decisão
  → Simuladores e Comparativos
  → Parecer Estratégico em PDF
```

## Perfis de acesso

### Administrador

- visualiza todos os leads;
- acessa todas as análises, simulações e versões de parecer;
- reatribui responsáveis;
- consulta histórico de alterações;
- gerencia usuários ativos.

### Consultor

- visualiza apenas leads próprios;
- cria e atualiza suas análises;
- gera cenários e pareceres vinculados aos próprios leads;
- não consulta empresas, diagnósticos ou arquivos de outros consultores.

A restrição deve existir no banco por Row Level Security, e não apenas na interface.

## Entidades principais

- `profiles`: perfil autenticado, função e situação do usuário;
- `companies`: identificação empresarial única por CNPJ normalizado;
- `leads`: vínculo entre empresa e consultor responsável;
- `strategic_assessments`: versões da Ficha Estratégica;
- `scenarios`: simulações produzidas a partir de uma análise;
- `reports`: versões de parecer e metadados do PDF;
- `audit_events`: trilha de eventos relevantes.

## Regra de duplicidade de CNPJ

O CNPJ é único na base. Quando um consultor tentar cadastrar empresa já existente sem possuir acesso, a aplicação não deve revelar os dados do registro. Deve informar somente que existe registro interno e orientar solicitação ao administrador.

## Versionamento

Análises e pareceres não são sobrescritos. Cada nova emissão preserva:

- versão;
- data e usuário responsável;
- dados de origem;
- índices calculados;
- regras e premissas utilizadas;
- cenários considerados;
- arquivo PDF correspondente.

## Geração de PDF

O parecer será gerado a partir de um snapshot imutável da análise e dos cenários. O arquivo deverá conter:

1. capa;
2. objetivo da análise;
3. perfil empresarial;
4. leitura dos índices;
5. fatores de pressão e fatores favoráveis;
6. exposição à Reforma Tributária;
7. mapa do passivo;
8. cenários comparados;
9. recomendação;
10. plano de ação;
11. documentos pendentes;
12. premissas e limitações.

Os PDFs devem permanecer em bucket privado e ser acessados por URL temporária após validação de permissão.

## Princípios analíticos

- dado ausente não é zero;
- resultado interno não se confunde com classificação oficial de órgão público;
- todo índice deve ser explicável;
- regras legais e editais devem ser versionados;
- recomendação não será definida apenas pela menor parcela;
- a confiança dos dados condiciona a força da conclusão.
