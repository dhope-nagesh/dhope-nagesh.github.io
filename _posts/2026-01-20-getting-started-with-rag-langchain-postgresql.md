---
layout: post
title: "Getting Started with RAG Using LangChain and PostgreSQL"
date: 2026-01-20
tags: [AI, Python, LangChain]
read_time: 10
excerpt: "How to build a Retrieval-Augmented Generation pipeline using LangChain, pgvector, and OpenAI embeddings for intelligent document search."
---

Retrieval-Augmented Generation (RAG) has become the go-to pattern for building AI applications that need to answer questions over your own data. Instead of fine-tuning a model, you retrieve relevant context at query time and feed it to the LLM. In this post, I'll show how to build a RAG pipeline using LangChain and PostgreSQL with pgvector.

## Why RAG?

Large Language Models are powerful but have two key limitations:

1. **Knowledge cutoff** — They don't know about your private data or recent events
2. **Hallucination** — They can confidently generate incorrect information

RAG addresses both by grounding the LLM's responses in actual retrieved documents. The architecture is straightforward:

1. **Ingest** — Split documents into chunks, generate embeddings, store in a vector database
2. **Retrieve** — Given a user query, find the most relevant chunks via similarity search
3. **Generate** — Pass the retrieved chunks as context to the LLM for answer generation

## Setting Up pgvector

PostgreSQL with the pgvector extension is an excellent choice for vector storage — you get a battle-tested database with full SQL capabilities plus vector similarity search:

```sql
CREATE EXTENSION vector;

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1536)
);

CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

## Building the Ingestion Pipeline

Using LangChain, the ingestion pipeline is just a few lines:

```python
from langchain_community.document_loaders import DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import PGVector

# 1. Load documents
loader = DirectoryLoader("./docs", glob="**/*.md")
documents = loader.load()

# 2. Split into chunks
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", ". ", " ", ""]
)
chunks = text_splitter.split_documents(documents)

# 3. Store embeddings in PostgreSQL
CONNECTION_STRING = "postgresql://user:pass@localhost:5432/ragdb"

vectorstore = PGVector.from_documents(
    documents=chunks,
    embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
    connection_string=CONNECTION_STRING,
    collection_name="my_docs",
)
```

### Chunking Strategy Matters

The choice of chunk size and overlap significantly affects retrieval quality:

- **Too small** (< 200 tokens) — Loses context, retrieves fragments
- **Too large** (> 2000 tokens) — Dilutes the relevant information
- **Sweet spot** — 500-1000 tokens with 10-20% overlap

Use `RecursiveCharacterTextSplitter` as it respects document structure (paragraphs, sentences) rather than cutting mid-sentence.

## Building the Query Pipeline

```python
from langchain_openai import ChatOpenAI
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

# Create retriever
retriever = vectorstore.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 4}
)

# Custom prompt template
template = """Use the following context to answer the question.
If you don't know the answer based on the context, say so.

Context:
{context}

Question: {question}

Answer:"""

prompt = PromptTemplate(
    template=template,
    input_variables=["context", "question"]
)

# Build the chain
qa_chain = RetrievalQA.from_chain_type(
    llm=ChatOpenAI(model="gpt-4", temperature=0),
    chain_type="stuff",
    retriever=retriever,
    chain_type_kwargs={"prompt": prompt},
    return_source_documents=True,
)

# Query
result = qa_chain.invoke({"query": "How do I configure replication?"})
print(result["result"])
```

## Improving Retrieval Quality

Basic similarity search is a good start, but there are several techniques to improve quality:

### Hybrid Search

Combine vector similarity with keyword search for better recall:

```python
retriever = vectorstore.as_retriever(
    search_type="mmr",  # Maximal Marginal Relevance
    search_kwargs={
        "k": 4,
        "fetch_k": 20,  # Fetch more, then re-rank for diversity
    }
)
```

### Metadata Filtering

Use PostgreSQL's JSONB capabilities to filter before vector search:

```python
retriever = vectorstore.as_retriever(
    search_kwargs={
        "k": 4,
        "filter": {"source": "admin-guide"}
    }
)
```

### Re-ranking

Add a cross-encoder re-ranking step after initial retrieval to improve precision. This is especially useful when you retrieve a larger set (say 20 documents) and want to pick the top 4.

## Why PostgreSQL for Vector Search?

Using pgvector over a dedicated vector database has practical advantages:

1. **Operational simplicity** — One database to manage, back up, and monitor
2. **Transactional consistency** — Embeddings and metadata update atomically
3. **Rich queries** — Combine vector search with SQL joins, aggregations, and filters
4. **Existing infrastructure** — If you already run Postgres, just add the extension

For most use cases under a few million vectors, pgvector performs well. For larger scale, consider HNSW indexes (supported since pgvector 0.5.0) for better query performance.

## Wrapping Up

RAG with LangChain and PostgreSQL is a pragmatic approach to building AI-powered applications over your own data. Start with the basic pipeline, measure retrieval quality, and iterate on chunking strategy and retrieval methods. The combination of LangChain's abstractions with PostgreSQL's reliability makes for a production-friendly stack.
