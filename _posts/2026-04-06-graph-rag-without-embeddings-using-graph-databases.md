---
layout: post
title: "RAG Without Embeddings: Using Graph Databases for Better Retrieval"
date: 2026-04-06
tags: [AI, Python, Performance]
read_time: 13
excerpt: "Why embedding-based RAG fails on multi-hop and relationship-heavy questions, and how graph database retrieval can deliver more grounded, explainable answers."
---

Embedding-based RAG is a great default, but it is not a silver bullet. In many production systems, the hard questions are not semantic similarity problems; they are **relationship reasoning** problems.

In this post, I'll show how to build **graph-based RAG without embeddings** using a graph database, and why this approach often outperforms embedding retrieval on complex enterprise queries.

## Where Embedding RAG Struggles

Embedding retrieval works by mapping documents and queries into vectors and then doing nearest-neighbor search. That is excellent for semantic similarity, but several failure modes show up quickly in real workloads.

### 1. Multi-hop reasoning is weak

A query like "Which services owned by Team A call a deprecated payment API and are deployed in eu-west-1?" requires joining multiple facts:

- ownership relation
- service dependency relation
- API lifecycle relation
- deployment relation

Vector similarity can retrieve related text chunks, but it does not naturally model and traverse explicit relationships.

### 2. Ambiguous entities cause noisy retrieval

Terms like "gateway", "edge", or "auth" can refer to many entities. Embedding search often returns topically related but graph-irrelevant chunks.

### 3. Poor explainability

When a vector retriever picks chunk A over B, debugging why is difficult. Teams often need transparent answers like: "This result was selected because service X depends on API Y and API Y is marked deprecated."

### 4. Metadata and constraints are second-class

Questions with strict constraints (region, version, owner, compliance tier) are awkward in pure vector search and often require ad hoc filtering.

## Why Graph RAG Helps

Graph RAG stores knowledge as entities and relationships, then retrieves context by traversing those relationships with explicit constraints.

Instead of asking "what text is similar to this question?", you ask:

1. What entities are mentioned?
2. How are they connected?
3. Which paths satisfy business constraints?

This shifts retrieval from semantic proximity to structural relevance.

## Minimal Graph Schema

You can model many enterprise knowledge domains with a compact schema:

```sql
(:Service {name, owner, tier, region})
(:API {name, version, status})
(:Team {name})
(:Incident {id, severity, date})
(:DocChunk {id, text, source})

(:Team)-[:OWNS]->(:Service)
(:Service)-[:CALLS]->(:API)
(:Service)-[:DEPLOYED_IN]->(:Region)
(:Service)-[:LINKED_TO]->(:DocChunk)
(:Incident)-[:IMPACTED]->(:Service)
```

Even if your source data is documents, extracting entities and edges during ingestion creates a navigable knowledge graph for retrieval.

## Graph Retrieval Query (Cypher)

Suppose a user asks:

"Which Team A services call deprecated APIs in eu-west-1, and what is the migration guidance?"

With a graph database like Neo4j, retrieval becomes explicit:

```cypher
MATCH (t:Team {name: $team})-[:OWNS]->(s:Service)-[:CALLS]->(a:API)
MATCH (s)-[:DEPLOYED_IN]->(:Region {name: $region})
WHERE a.status = 'deprecated'

OPTIONAL MATCH (s)-[:LINKED_TO]->(d:DocChunk)

RETURN
  s.name AS service,
  a.name AS api,
  a.version AS version,
  collect(DISTINCT d.text)[0..5] AS evidence
ORDER BY service;
```

This query returns grounded, constraint-aware evidence instead of semantically similar but potentially unrelated chunks.

## End-to-End Graph RAG Flow

The generation step still uses an LLM; only retrieval changes.

1. **Question parsing**
Extract entities and constraints from the question (team, API status, region, time range).

2. **Graph retrieval**
Run Cypher queries and optional k-hop traversals to fetch relevant paths and evidence chunks.

3. **Context packaging**
Build a context block with triples/paths and source evidence text.

4. **Answer generation**
Prompt the LLM to answer only from provided graph evidence.

## Python Example: Graph Retriever + LLM

```python
from neo4j import GraphDatabase
from openai import OpenAI

SYSTEM_PROMPT = """You are a helpful assistant.
Answer only from the provided graph evidence.
If evidence is insufficient, say you do not know.
"""

CYPHER = """
MATCH (t:Team {name: $team})-[:OWNS]->(s:Service)-[:CALLS]->(a:API)
MATCH (s)-[:DEPLOYED_IN]->(:Region {name: $region})
WHERE a.status = 'deprecated'
OPTIONAL MATCH (s)-[:LINKED_TO]->(d:DocChunk)
RETURN s.name AS service,
     a.name AS api,
     a.version AS version,
     collect(DISTINCT d.text)[0..3] AS evidence
ORDER BY service
LIMIT 20;
"""


def retrieve_graph(driver, team, region):
  with driver.session() as session:
    rows = session.run(CYPHER, team=team, region=region)
    return [record.data() for record in rows]


def build_context(rows):
  blocks = []
  for i, row in enumerate(rows, start=1):
    blocks.append(
      "\n".join([
        f"[{i}] service={row['service']}",
        f"api={row['api']} version={row['version']}",
        "evidence:",
        *(row.get("evidence") or []),
      ])
    )
  return "\n\n".join(blocks)


def answer_question(team, region, question):
  driver = GraphDatabase.driver(
    "bolt://localhost:7687", auth=("neo4j", "password")
  )
  rows = retrieve_graph(driver, team=team, region=region)
  context = build_context(rows)

  client = OpenAI()
  response = client.chat.completions.create(
    model="gpt-4o-mini",
    temperature=0,
    messages=[
      {"role": "system", "content": SYSTEM_PROMPT},
      {
        "role": "user",
        "content": f"Question: {question}\n\nGraph Evidence:\n{context}",
      },
    ],
  )
  return response.choices[0].message.content


if __name__ == "__main__":
  q = "Which Team A services in eu-west-1 call deprecated APIs?"
  print(answer_question("Team A", "eu-west-1", q))
```

## How Graph Retrieval Solves Embedding Problems

### 1. Multi-hop questions become first-class

In graph RAG, multi-hop is just traversal depth. You can explicitly follow $n$ edges and apply constraints at each step.

### 2. Entity disambiguation improves

Nodes represent canonical entities (`Service:payments-gateway`), so retrieval is anchored to IDs, not just similar words.

### 3. Explanations are native

You can return the exact reasoning path:

`Team A -> OWNS -> payments-service -> CALLS -> billing-v1 API (deprecated)`

This gives auditable evidence for generated answers.

### 4. Constraints are easy and exact

Region, owner, version, status, and time windows are direct query predicates, not fuzzy ranking hints.

## Practical Ingestion Strategy

Building a good graph is the hard part. A practical pipeline:

1. Chunk documents
2. Extract entities and relations (NER + relation extraction or rule-based parsing)
3. Resolve entities to canonical IDs (dedup + alias mapping)
4. Upsert nodes and edges
5. Link evidence chunks back to entities for grounded generation

Start with high-confidence rules for critical entity types (service names, API names, owners) before introducing model-based extraction.

## Should You Replace Embeddings Completely?

Not always. The strongest setup in many systems is:

1. **Graph-first retrieval** for constraint-heavy, relationship-heavy questions
2. **Embedding fallback** for broad semantic exploration
3. **Fusion/re-ranking** to combine both when needed

But if your workload is primarily operational reasoning over known entities, graph-only retrieval can be both simpler and more accurate.

## Common Pitfalls in Graph RAG

1. **Weak entity resolution**
If aliases are unresolved, your graph fragments and recall drops.

2. **Overly dense graphs**
If everything connects to everything, traversal noise increases. Keep relation types meaningful.

3. **No provenance links**
Always keep links from graph facts back to source chunks for answer grounding.

4. **Unbounded traversal**
Apply depth limits and predicates, or query latency will grow quickly.

## Conclusion

Embedding RAG is great for semantic similarity, but it often struggles with relationship-heavy reasoning, strict constraints, and explainability. Graph databases solve these problems by making entities and relationships explicit, queryable, and auditable.

If your users ask questions that sound like joins rather than summaries, graph-based RAG without embeddings is a strong architecture to adopt first.
